/**
 * Integration tests for the import job routes.
 *
 * Three things here are real-database properties. POST /start runs its discard
 * and its persist in ONE transaction, and `ImportJob.userId` is unique — so
 * whether a second start actually replaces the first (rather than colliding on
 * the constraint or leaving orphaned rows) can only be answered by Postgres.
 * GET /status aggregates row states with a groupBy. And the review routes are
 * scoped through the owning job, which needs two real users to mean anything.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, getTestPrisma, truncateAll, seedUser } from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockLambdaSend } = vi.hoisted(() => ({
  mockLambdaSend: vi.fn(async () => ({})),
}))
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = mockLambdaSend
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}))

const { default: importExportApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

function send(userId: string, method: string, path: string, body?: unknown) {
  return buildApp(importExportApp, { userId }).request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** A minimal valid commit row. */
function row(rowIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    type: 'completion',
    rowIndex,
    data: { levelId: String(100 + rowIndex), levelName: `Level ${rowIndex}`, ...overrides },
  }
}

/** Creates a job with rows in the given states, bypassing the routes. */
async function seedJob(
  userId: string,
  rows: { status: string; issueMessage?: string | null }[]
) {
  const job = await prisma.importJob.create({
    data: { userId, status: 'running', totalRows: rows.length },
  })
  for (const [i, r] of rows.entries()) {
    await prisma.importJobRow.create({
      data: {
        jobId: job.id,
        rowIndex: i,
        rawData: {},
        status: r.status,
        issueMessage: r.issueMessage ?? null,
      },
    })
  }
  return job
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
  vi.stubEnv('IMPORT_WORKER_ARN', 'arn:aws:lambda:us-east-1:1234:function:worker')
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── POST /start ─────────────────────────────────────────────────────────────

describe('POST /me/import/start', () => {
  it('persists the job and one row per sheet row', async () => {
    const user = await seedUser(prisma)

    const res = await send(user.id, 'POST', '/me/import/start', {
      rows: [row(0), row(1)],
    })

    expect(res.status).toBe(202)
    const job = await prisma.importJob.findUniqueOrThrow({
      where: { userId: user.id },
    })
    expect(job.totalRows).toBe(2)
    const rows = await prisma.importJobRow.findMany({
      where: { jobId: job.id },
      orderBy: { rowIndex: 'asc' },
    })
    expect(rows.map((r) => r.rowIndex)).toEqual([0, 1])
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
  })

  it('stores the searchable identifiers alongside each row', async () => {
    const user = await seedUser(prisma)

    await send(user.id, 'POST', '/me/import/start', { rows: [row(0)] })

    const stored = await prisma.importJobRow.findFirstOrThrow({})
    expect(stored.levelName).toBe('Level 0')
    expect(stored.identifier).toBe('100')
  })

  it('replaces a previous job entirely, cascading its rows', async () => {
    // ImportJob.userId is unique and there is no import history — the second
    // start has to delete the first, not collide with it.
    const user = await seedUser(prisma)
    const first = await seedJob(user.id, [{ status: 'committed' }])

    await send(user.id, 'POST', '/me/import/start', { rows: [row(0)] })

    expect(
      await prisma.importJob.findUnique({ where: { id: first.id } })
    ).toBeNull()
    expect(await prisma.importJobRow.count({ where: { jobId: first.id } })).toBe(0)
    expect(await prisma.importJob.count({ where: { userId: user.id } })).toBe(1)
  })

  it('does not disturb another user’s job', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    const theirs = await seedJob(other.id, [{ status: 'committed' }])

    await send(user.id, 'POST', '/me/import/start', { rows: [row(0)] })

    expect(
      await prisma.importJob.findUnique({ where: { id: theirs.id } })
    ).not.toBeNull()
  })

  it('persists the optional tab payloads', async () => {
    const user = await seedUser(prisma)

    await send(user.id, 'POST', '/me/import/start', {
      rows: [row(0)],
      ranking: [{ levelId: '100' }],
      collections: [{ list: 'Favorites', levelId: '100' }],
      ratings: [{ levelId: '100', scores: { Gameplay: 85 } }],
    })

    const job = await prisma.importJob.findUniqueOrThrow({
      where: { userId: user.id },
    })
    expect(job.rankingPayload).toEqual([{ levelId: '100' }])
    expect(job.collectionsPayload).toEqual([
      { list: 'Favorites', levelId: '100' },
    ])
    expect(job.ratingsPayload).toEqual([
      { levelId: '100', scores: { Gameplay: 85 } },
    ])
  })

  it('writes nothing when the body fails validation', async () => {
    const user = await seedUser(prisma)

    const res = await send(user.id, 'POST', '/me/import/start', { rows: [] })

    expect(res.status).toBe(400)
    expect(await prisma.importJob.count()).toBe(0)
  })
})

// ─── GET /status ─────────────────────────────────────────────────────────────

describe('GET /me/import/status', () => {
  it('returns null when the user has no job', async () => {
    const user = await seedUser(prisma)

    const res = await send(user.id, 'GET', '/me/import/status')

    await expect(res.json()).resolves.toEqual({ data: null })
  })

  it('tallies the outcome counts from real row states', async () => {
    const user = await seedUser(prisma)
    await seedJob(user.id, [
      { status: 'committed' },
      { status: 'committed' },
      { status: 'skipped' },
      { status: 'failed' },
      { status: 'pending' },
    ])

    const res = await send(user.id, 'GET', '/me/import/status')
    const body = (await res.json()) as {
      data: { outcomeCounts: Record<string, number> }
    }

    // 'pending' is in-flight, not an outcome — counting it would make the
    // totals disagree with the review UI.
    expect(body.data.outcomeCounts).toEqual({
      committed: 2,
      updated: 0,
      skipped: 1,
      failed: 1,
    })
  })

  it('surfaces only the rows carrying an issue, in row order', async () => {
    const user = await seedUser(prisma)
    await seedJob(user.id, [
      { status: 'committed' },
      { status: 'failed', issueMessage: 'Level not found' },
      { status: 'committed', issueMessage: 'Possible duplicate' },
    ])

    const res = await send(user.id, 'GET', '/me/import/status')
    const body = (await res.json()) as {
      data: { flaggedRows: { rowIndex: number; issueMessage: string }[] }
    }

    expect(body.data.flaggedRows.map((r) => r.rowIndex)).toEqual([1, 2])
    expect(body.data.flaggedRows[0]!.issueMessage).toBe('Level not found')
  })

  it('returns the caller’s job, not another user’s', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedJob(other.id, [{ status: 'committed' }])

    const res = await send(user.id, 'GET', '/me/import/status')

    await expect(res.json()).resolves.toEqual({ data: null })
  })
})

// ─── review routes ───────────────────────────────────────────────────────────

describe('review routes', () => {
  it('marks one flagged row reviewed', async () => {
    const user = await seedUser(prisma)
    const job = await seedJob(user.id, [
      { status: 'failed', issueMessage: 'Level not found' },
    ])
    const target = await prisma.importJobRow.findFirstOrThrow({
      where: { jobId: job.id },
    })

    const res = await send(
      user.id,
      'PATCH',
      `/me/import/rows/${target.id}/resolve`
    )

    expect(res.status).toBe(200)
    const stored = await prisma.importJobRow.findUniqueOrThrow({
      where: { id: target.id },
    })
    expect(stored.resolved).toBe(true)
  })

  it('404s for a row on another user’s job and leaves it unresolved', async () => {
    // The scope goes through the owning job — this is what stops one user
    // resolving another's review queue.
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    const job = await seedJob(other.id, [
      { status: 'failed', issueMessage: 'Level not found' },
    ])
    const target = await prisma.importJobRow.findFirstOrThrow({
      where: { jobId: job.id },
    })

    const res = await send(
      user.id,
      'PATCH',
      `/me/import/rows/${target.id}/resolve`
    )

    expect(res.status).toBe(404)
    const stored = await prisma.importJobRow.findUniqueOrThrow({
      where: { id: target.id },
    })
    expect(stored.resolved).toBe(false)
  })

  it('bulk-resolves every flagged row and leaves the clean ones alone', async () => {
    const user = await seedUser(prisma)
    const job = await seedJob(user.id, [
      { status: 'committed' },
      { status: 'failed', issueMessage: 'Level not found' },
      { status: 'committed', issueMessage: 'Possible duplicate' },
    ])

    const res = await send(user.id, 'POST', '/me/import/resolve-all')

    expect(res.status).toBe(200)
    const rows = await prisma.importJobRow.findMany({
      where: { jobId: job.id },
      orderBy: { rowIndex: 'asc' },
    })
    expect(rows.map((r) => r.resolved)).toEqual([false, true, true])
  })

  it('404s resolve-all when there is no job', async () => {
    const user = await seedUser(prisma)

    expect(
      (await send(user.id, 'POST', '/me/import/resolve-all')).status
    ).toBe(404)
  })
})
