/**
 * Integration tests for the GDDL sync job routes.
 *
 * `GddlSyncJob.userId` is unique and the upsert never touches `id`, so a user's
 * job id is stable forever — a new sync reuses the same row. That is why the
 * client can't dedupe "have I shown this run's toast" by id, and why the ack
 * pins `startedAt` as well. A mocked Prisma can't demonstrate any of that: it
 * takes a real row surviving across two syncs. This is the shape behind the
 * 2026-08-05 stale-toast bug, so it is pinned here directly.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
} from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../../utils/kms', () => ({
  encryptSecret: vi.fn(async () => 'ciphertext-blob'),
  decryptSecret: vi.fn(async () => 'plaintext-key'),
}))

const { mockLambdaSend, mockSyncGddlLists } = vi.hoisted(() => ({
  mockLambdaSend: vi.fn(async () => ({})),
  mockSyncGddlLists: vi.fn(async () => ({
    favorites: {
      addedToInferno: [],
      addedToGddl: [],
      removedFromGddl: [],
      skipped: [],
    },
    leastFavorites: {
      addedToInferno: [],
      addedToGddl: [],
      removedFromGddl: [],
      skipped: [],
    },
  })),
}))
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = mockLambdaSend
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}))
vi.mock('../../services/gddl/listSync', () => ({
  syncGddlLists: mockSyncGddlLists,
}))

const { default: accountApp } = await import('./index')

const prisma = getTestPrisma()

// ─── helpers ─────────────────────────────────────────────────────────────────

function send(userId: string, method: string, path: string, body?: unknown) {
  return buildApp(accountApp, { userId }).request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** A user with a GDDL key configured — the precondition for every route here. */
function seedKeyedUser() {
  return seedUser(prisma, { gddlApiKeyEncrypted: 'ciphertext-blob' })
}

/** Marks the user's job finished, as the worker would. */
async function finishJob(userId: string, status = 'completed') {
  await prisma.gddlSyncJob.update({
    where: { userId },
    data: { status, finishedAt: new Date(), result: { created: 1 } },
  })
  return prisma.gddlSyncJob.findUniqueOrThrow({ where: { userId } })
}

/** The `data` of GET /me/gddl-sync. */
async function getSync(userId: string) {
  const res = await send(userId, 'GET', '/me/gddl-sync')
  return (await res.json()) as {
    data: { id: string; status: string; startedAt: string } | null
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
  vi.stubEnv(
    'GDDL_SYNC_WORKER_ARN',
    'arn:aws:lambda:us-east-1:1234:function:sync'
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── starting a sync ─────────────────────────────────────────────────────────

describe('POST /me/gddl-sync', () => {
  it('creates a pending job and invokes the worker', async () => {
    const user = await seedKeyedUser()

    const res = await send(user.id, 'POST', '/me/gddl-sync')

    expect(res.status).toBe(202)
    const job = await prisma.gddlSyncJob.findUniqueOrThrow({
      where: { userId: user.id },
    })
    expect(job.status).toBe('pending')
    expect(mockLambdaSend).toHaveBeenCalledTimes(1)
  })

  it('400s without a configured key and creates no job', async () => {
    const user = await seedUser(prisma)

    const res = await send(user.id, 'POST', '/me/gddl-sync')

    expect(res.status).toBe(400)
    expect(await prisma.gddlSyncJob.count()).toBe(0)
  })

  it('returns the in-flight job rather than starting a second', async () => {
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')

    const res = await send(user.id, 'POST', '/me/gddl-sync')

    expect(res.status).toBe(202)
    expect(mockLambdaSend).toHaveBeenCalledTimes(1)
    expect(await prisma.gddlSyncJob.count({ where: { userId: user.id } })).toBe(
      1
    )
  })

  it('reuses the same row and id when a finished job is re-run', async () => {
    // The id is stable per user forever — this is the property that makes
    // id-based client dedup impossible.
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')
    const first = await finishJob(user.id)

    await send(user.id, 'POST', '/me/gddl-sync')
    const second = await prisma.gddlSyncJob.findUniqueOrThrow({
      where: { userId: user.id },
    })

    expect(second.id).toBe(first.id)
    expect(await prisma.gddlSyncJob.count()).toBe(1)
  })

  it('clears the previous run’s result, error and ack on re-run', async () => {
    // Otherwise GET would serve the old run's outcome for the new run.
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')
    await finishJob(user.id)
    await prisma.gddlSyncJob.update({
      where: { userId: user.id },
      data: { acknowledgedAt: new Date(), error: 'old failure' },
    })

    await send(user.id, 'POST', '/me/gddl-sync')

    const job = await prisma.gddlSyncJob.findUniqueOrThrow({
      where: { userId: user.id },
    })
    expect(job.status).toBe('pending')
    expect(job.acknowledgedAt).toBeNull()
    expect(job.error).toBeNull()
    expect(job.finishedAt).toBeNull()
  })

  it('gives a new run a fresh startedAt', async () => {
    // The ack pins startedAt, so it has to actually change between runs.
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')
    const first = await finishJob(user.id)

    await send(user.id, 'POST', '/me/gddl-sync')
    const second = await prisma.gddlSyncJob.findUniqueOrThrow({
      where: { userId: user.id },
    })

    expect(second.startedAt.getTime()).toBeGreaterThan(
      first.startedAt.getTime()
    )
  })
})

// ─── reading a sync ──────────────────────────────────────────────────────────

describe('GET /me/gddl-sync', () => {
  it('returns null when there has never been a sync', async () => {
    const user = await seedKeyedUser()

    expect((await getSync(user.id)).data).toBeNull()
  })

  it('reports a pending job', async () => {
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')

    expect((await getSync(user.id)).data?.status).toBe('pending')
  })

  it('reports a finished job until it is acknowledged', async () => {
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')
    await finishJob(user.id)

    expect((await getSync(user.id)).data?.status).toBe('completed')
  })

  it('stops reporting it once acknowledged', async () => {
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')
    const job = await finishJob(user.id)

    await send(user.id, 'POST', '/me/gddl-sync/ack', {
      jobId: job.id,
      startedAt: job.startedAt.toISOString(),
    })

    expect((await getSync(user.id)).data).toBeNull()
  })

  it('expires a pending job that has been running too long', async () => {
    // A worker that died leaves the row pending forever otherwise.
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')
    await prisma.gddlSyncJob.update({
      where: { userId: user.id },
      data: { startedAt: new Date(Date.now() - 60 * 60 * 1000) },
    })

    const { data } = await getSync(user.id)

    expect(data?.status).not.toBe('pending')
  })
})

// ─── acknowledging a run ─────────────────────────────────────────────────────

describe('POST /me/gddl-sync/ack', () => {
  it('is a no-op for a stale startedAt from a previous run', async () => {
    // THE bug this design fixes: the id is identical across runs, so a delayed
    // ack for run 1 would otherwise mark run 2 acknowledged before the client
    // ever saw it.
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')
    const firstRun = await finishJob(user.id)

    // A second sync starts and finishes before the stale ack lands.
    await send(user.id, 'POST', '/me/gddl-sync')
    await finishJob(user.id)

    const res = await send(user.id, 'POST', '/me/gddl-sync/ack', {
      jobId: firstRun.id,
      startedAt: firstRun.startedAt.toISOString(),
    })

    expect(res.status).toBe(200)
    // The new run is still visible — the stale ack matched nothing.
    expect((await getSync(user.id)).data?.status).toBe('completed')
    const job = await prisma.gddlSyncJob.findUniqueOrThrow({
      where: { userId: user.id },
    })
    expect(job.acknowledgedAt).toBeNull()
  })

  it('does not acknowledge a job that is still pending', async () => {
    const user = await seedKeyedUser()
    await send(user.id, 'POST', '/me/gddl-sync')
    const job = await prisma.gddlSyncJob.findUniqueOrThrow({
      where: { userId: user.id },
    })

    await send(user.id, 'POST', '/me/gddl-sync/ack', {
      jobId: job.id,
      startedAt: job.startedAt.toISOString(),
    })

    const after = await prisma.gddlSyncJob.findUniqueOrThrow({
      where: { userId: user.id },
    })
    expect(after.acknowledgedAt).toBeNull()
  })

  it('cannot acknowledge another user’s job', async () => {
    const user = await seedKeyedUser()
    const other = await seedKeyedUser()
    await send(other.id, 'POST', '/me/gddl-sync')
    const theirs = await finishJob(other.id)

    await send(user.id, 'POST', '/me/gddl-sync/ack', {
      jobId: theirs.id,
      startedAt: theirs.startedAt.toISOString(),
    })

    const after = await prisma.gddlSyncJob.findUniqueOrThrow({
      where: { userId: other.id },
    })
    expect(after.acknowledgedAt).toBeNull()
  })

  it('400s on a body missing the run identifiers', async () => {
    const user = await seedKeyedUser()

    expect(
      (await send(user.id, 'POST', '/me/gddl-sync/ack', { jobId: 'x' })).status
    ).toBe(400)
  })
})

// ─── list sync ───────────────────────────────────────────────────────────────

describe('POST /me/gddl-lists-sync', () => {
  it('runs against the caller’s decrypted key', async () => {
    const user = await seedKeyedUser()

    const res = await send(user.id, 'POST', '/me/gddl-lists-sync')

    expect(res.status).toBe(200)
    expect(mockSyncGddlLists).toHaveBeenCalledWith(user.id, 'plaintext-key')
  })

  it('400s without a configured key', async () => {
    const user = await seedUser(prisma)

    expect((await send(user.id, 'POST', '/me/gddl-lists-sync')).status).toBe(
      400
    )
    expect(mockSyncGddlLists).not.toHaveBeenCalled()
  })
})
