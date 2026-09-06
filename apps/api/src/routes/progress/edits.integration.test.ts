import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
  seedRatingCategory,
} from '../../test/utils'

// Real DB; mock only Sentry + logger (no external HTTP in this read path).
vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: progressApp } = await import('./index')

const prisma = getTestPrisma()

function del(userId: string, levelId: string) {
  return buildApp(progressApp, { userId }).request(`/me/progress/${levelId}`, {
    method: 'DELETE',
  })
}

function delUpdate(userId: string, levelId: string, progressUpdateId: string) {
  return buildApp(progressApp, { userId }).request(
    `/me/progress/${levelId}/updates/${progressUpdateId}`,
    { method: 'DELETE' }
  )
}

function patch(userId: string, levelId: string, payload: unknown) {
  return buildApp(progressApp, { userId }).request(`/me/progress/${levelId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// Helper: create a level_progress row with progress updates inline.
async function seedProgress(
  db: PrismaClient,
  args: {
    userId: string
    levelId: string
    status: 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
    // One current value per level, not per event — lives on LevelProgress.
    simpleRating?: number | null
    ratingScores?: Array<{ categoryId: string; score: number }>
    updates?: Array<{
      kind?: 'PROGRESS' | 'DROP' | 'COMPLETION'
      loggedAt?: Date
      // The date the user says it happened, as opposed to loggedAt.
      date?: Date | null
      enjoyment?: number | null
      percentage?: number | null
      runFrom?: number | null
      runTo?: number | null
      attempts?: number | null
    }>
  }
) {
  return db.levelProgress.create({
    data: {
      userId: args.userId,
      levelId: args.levelId,
      status: args.status,
      simpleRating: args.simpleRating ?? null,
      ...(args.ratingScores
        ? { ratingScores: { create: args.ratingScores } }
        : {}),
      progressUpdates: {
        create: (args.updates ?? []).map((u) => ({
          kind: u.kind ?? 'PROGRESS',
          loggedAt: u.loggedAt,
          date: u.date ?? null,
          enjoyment: u.enjoyment ?? null,
          percentage: u.percentage ?? null,
          runFrom: u.runFrom ?? null,
          runTo: u.runTo ?? null,
          attempts: u.attempts ?? null,
        })),
      },
    },
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('DELETE /me/progress/:levelId', () => {
  it('deletes the entry and cascades to updates + children', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '900' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '900',
      status: 'COMPLETED',
      simpleRating: 70,
      updates: [{ kind: 'COMPLETION' }],
    })

    const res = await del(user.id, '900')
    // Returns 200 with GDDL caveat (not 204) so the client can surface the message.
    expect(res.status).toBe(200)
    const body = (await res.json()) as { gddlCaveat: string }
    expect(body.gddlCaveat).toContain('GDDL')

    expect(
      await prisma.levelProgress.findUnique({ where: { id: lp.id } })
    ).toBeNull()
    expect(
      await prisma.progressUpdate.count({ where: { levelProgressId: lp.id } })
    ).toBe(0)
  })

  it('404s for a level the user has no entry for', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '901' })
    await seedProgress(prisma, {
      userId: other.id,
      levelId: '901',
      status: 'IN_PROGRESS',
      updates: [{ percentage: 10 }],
    })

    const res = await del(user.id, '901')
    expect(res.status).toBe(404)
    // The other user's row is untouched.
    expect(
      await prisma.levelProgress.findUnique({
        where: { userId_levelId: { userId: other.id, levelId: '901' } },
      })
    ).not.toBeNull()
  })
})
describe('DELETE /me/progress/:levelId/updates/:progressUpdateId', () => {
  it('deletes a non-last update, leaving the level entry and its rating scores intact', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '910' })
    const cat = await seedRatingCategory(prisma, user.id)
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '910',
      status: 'COMPLETED',
      // Rating scores live on LevelProgress, not any specific update — they
      // are never cascaded by deleting one of several updates.
      ratingScores: [{ categoryId: cat.id, score: 80 }],
      updates: [
        { kind: 'PROGRESS', loggedAt: new Date('2024-01-01'), percentage: 40 },
        { kind: 'COMPLETION', loggedAt: new Date('2024-01-02') },
      ],
    })
    const progressUpdate = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id, kind: 'PROGRESS' },
    })

    const res = await delUpdate(user.id, '910', progressUpdate.id)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { deletedLevelProgress: boolean }
    }
    expect(body.data.deletedLevelProgress).toBe(false)

    expect(
      await prisma.progressUpdate.findUnique({
        where: { id: progressUpdate.id },
      })
    ).toBeNull()
    // The completion (and the level entry) survive untouched.
    const remaining = await prisma.levelProgress.findUniqueOrThrow({
      where: { id: lp.id },
      include: { ratingScores: true },
    })
    expect(remaining.status).toBe('COMPLETED')
    expect(remaining.ratingScores).toHaveLength(1)
    expect(remaining.ratingScores[0]?.score).toBe(80)
  })

  it('deletes the whole level entry when it was the only logged update', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '911' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '911',
      status: 'IN_PROGRESS',
      updates: [{ kind: 'PROGRESS', percentage: 25 }],
    })
    const update = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
    })

    const res = await delUpdate(user.id, '911', update.id)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { deletedLevelProgress: boolean }
    }
    expect(body.data.deletedLevelProgress).toBe(true)

    expect(
      await prisma.levelProgress.findUnique({ where: { id: lp.id } })
    ).toBeNull()
  })

  it('reverts status and removes the classic demon list when the completion is deleted', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '912' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '912',
      status: 'COMPLETED',
      updates: [
        { kind: 'PROGRESS', loggedAt: new Date('2024-01-01'), percentage: 50 },
        { kind: 'COMPLETION', loggedAt: new Date('2024-01-02') },
      ],
    })
    await prisma.levelProgress.update({
      where: { id: lp.id },
      data: { coinsCollected: 3 },
    })
    await prisma.classicDemonList.create({
      data: { userId: user.id, levelProgressId: lp.id, listIndex: 1 },
    })
    const completion = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id, kind: 'COMPLETION' },
    })

    const res = await delUpdate(user.id, '912', completion.id)
    expect(res.status).toBe(200)

    const remaining = await prisma.levelProgress.findUniqueOrThrow({
      where: { id: lp.id },
    })
    expect(remaining.status).toBe('IN_PROGRESS')
    // Only meaningful once completed — cleared when the completion is undone.
    expect(remaining.coinsCollected).toBeNull()
    expect(
      await prisma.classicDemonList.findUnique({
        where: { levelProgressId: lp.id },
      })
    ).toBeNull()
  })

  it('404s for a progressUpdateId that does not belong to the level', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '913' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '913',
      status: 'IN_PROGRESS',
      updates: [{ percentage: 10 }],
    })

    const res = await delUpdate(user.id, '913', 'nonexistent-id')
    expect(res.status).toBe(404)
  })

  it("404s for another user's entry", async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '914' })
    const lp = await seedProgress(prisma, {
      userId: other.id,
      levelId: '914',
      status: 'IN_PROGRESS',
      updates: [{ percentage: 10 }],
    })
    const update = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
    })

    const res = await delUpdate(user.id, '914', update.id)
    expect(res.status).toBe(404)
    expect(
      await prisma.progressUpdate.findUnique({ where: { id: update.id } })
    ).not.toBeNull()
  })
})
describe('PATCH /me/progress/:levelId', () => {
  // ── the completion ordering rule ───────────────────────────────────────
  //
  // An edit can violate it the same way a fresh log can, by moving a session
  // past the completion — so the same guard covers both (see
  // services/progress/completionOrder.ts).

  // A beaten level with one earlier session on it: completion 2026-08-04,
  // progress 2026-08-02.
  async function seedBackfilledLevel(userId: string, levelId: string) {
    await seedLevel(prisma, { inGameId: levelId })
    const lp = await seedProgress(prisma, {
      userId,
      levelId,
      status: 'COMPLETED',
      updates: [
        {
          kind: 'COMPLETION',
          date: new Date('2026-08-04'),
          loggedAt: new Date('2026-08-04'),
        },
        {
          kind: 'PROGRESS',
          date: new Date('2026-08-02'),
          loggedAt: new Date('2026-08-02'),
          percentage: 61,
        },
      ],
    })
    const progressUpdate = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id, kind: 'PROGRESS' },
    })
    return { lp, progressUpdateId: progressUpdate.id }
  }

  it('refuses an edit that would move a session past the completion', async () => {
    const user = await seedUser(prisma)
    const { progressUpdateId } = await seedBackfilledLevel(user.id, '930')

    const res = await patch(user.id, '930', {
      progressUpdateId,
      date: '2026-08-06',
    })

    expect(res.status).toBe(409)
    const unchanged = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: progressUpdateId },
    })
    expect(unchanged.date?.toISOString().slice(0, 10)).toBe('2026-08-02')
  })

  it('allows an edit that keeps the session before the completion', async () => {
    const user = await seedUser(prisma)
    const { progressUpdateId } = await seedBackfilledLevel(user.id, '931')

    const res = await patch(user.id, '931', {
      progressUpdateId,
      date: '2026-08-01',
    })

    expect(res.status).toBe(200)
    const updated = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: progressUpdateId },
    })
    expect(updated.date?.toISOString().slice(0, 10)).toBe('2026-08-01')
  })

  it('leaves an edit that touches no date alone', async () => {
    // The guard only runs when a date is actually being written — an
    // unrelated save on a beaten level's session must not trip it.
    const user = await seedUser(prisma)
    const { progressUpdateId } = await seedBackfilledLevel(user.id, '932')

    const res = await patch(user.id, '932', {
      progressUpdateId,
      attempts: 4200,
    })

    expect(res.status).toBe(200)
  })

  it('round-trips date/dateTimezone and worstFailDate/worstFailDateTimezone', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '920' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '920',
      status: 'COMPLETED',
      updates: [{ kind: 'COMPLETION', loggedAt: new Date('2024-01-01') }],
    })

    const res = await patch(user.id, '920', {
      date: '2026-07-18T09:15:00.000Z',
      dateTimezone: 'America/New_York',
      worstFailDate: '2026-07-17T08:00:00.000Z',
      worstFailDateTimezone: 'America/New_York',
    })
    expect(res.status).toBe(200)

    const updated = await prisma.levelProgress.findUniqueOrThrow({
      where: { id: lp.id },
      include: { progressUpdates: true },
    })
    expect(updated.worstFailDateTimezone).toBe('America/New_York')
    expect(updated.progressUpdates[0]?.dateTimezone).toBe('America/New_York')
  })

  it('omitting dateTimezone/worstFailDateTimezone leaves the stored values untouched', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '921' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '921',
      status: 'COMPLETED',
      updates: [{ kind: 'COMPLETION', loggedAt: new Date('2024-01-01') }],
    })
    await prisma.levelProgress.update({
      where: { id: lp.id },
      data: { worstFailDateTimezone: 'UTC' },
    })
    await prisma.progressUpdate.updateMany({
      where: { levelProgressId: lp.id },
      data: { dateTimezone: 'UTC' },
    })

    const res = await patch(user.id, '921', { attempts: 42 })
    expect(res.status).toBe(200)

    const updated = await prisma.levelProgress.findUniqueOrThrow({
      where: { id: lp.id },
      include: { progressUpdates: true },
    })
    expect(updated.worstFailDateTimezone).toBe('UTC')
    expect(updated.progressUpdates[0]?.dateTimezone).toBe('UTC')
    expect(updated.progressUpdates[0]?.attempts).toBe(42)
  })

  it('setting percentage clears any existing runFrom/runTo', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '922' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '922',
      status: 'IN_PROGRESS',
      updates: [{ kind: 'PROGRESS', runFrom: 52, runTo: 92 }],
    })
    const before = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
    })

    const res = await patch(user.id, '922', {
      progressUpdateId: before.id,
      percentage: 63,
    })
    expect(res.status).toBe(200)

    const updated = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: before.id },
    })
    expect(updated.percentage?.toNumber()).toBe(63)
    expect(updated.runFrom).toBeNull()
    expect(updated.runTo).toBeNull()
  })

  it('setting runFrom/runTo clears any existing percentage', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '923' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '923',
      status: 'IN_PROGRESS',
      updates: [{ kind: 'PROGRESS', percentage: 63 }],
    })
    const before = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
    })

    const res = await patch(user.id, '923', {
      progressUpdateId: before.id,
      runFrom: 52,
      runTo: 92,
    })
    expect(res.status).toBe(200)

    const updated = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: before.id },
    })
    expect(updated.runFrom).toBe(52)
    expect(updated.runTo).toBe(92)
    expect(updated.percentage).toBeNull()
  })

  it('rejects setting percentage on a COMPLETION entry', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '925' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '925',
      status: 'COMPLETED',
      updates: [{ kind: 'COMPLETION' }],
    })
    const before = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
    })

    const res = await patch(user.id, '925', {
      progressUpdateId: before.id,
      percentage: 40,
    })
    expect(res.status).toBe(400)

    const unchanged = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: before.id },
    })
    expect(unchanged.percentage).toBeNull()
  })

  it('rejects setting runFrom/runTo on a DROP entry', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '926' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '926',
      status: 'DROPPED',
      updates: [{ kind: 'DROP' }],
    })
    const before = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
    })

    const res = await patch(user.id, '926', {
      progressUpdateId: before.id,
      runFrom: 40,
      runTo: 80,
    })
    expect(res.status).toBe(400)

    const unchanged = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: before.id },
    })
    expect(unchanged.runFrom).toBeNull()
    expect(unchanged.runTo).toBeNull()
  })

  it('rejects runTo less than runFrom', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '924' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '924',
      status: 'IN_PROGRESS',
      updates: [{ kind: 'PROGRESS', runFrom: 52, runTo: 92 }],
    })
    const before = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
    })

    const res = await patch(user.id, '924', {
      progressUpdateId: before.id,
      runFrom: 92,
      runTo: 52,
    })
    expect(res.status).toBe(400)

    const unchanged = await prisma.progressUpdate.findUniqueOrThrow({
      where: { id: before.id },
    })
    expect(unchanged.runFrom).toBe(52)
    expect(unchanged.runTo).toBe(92)
  })
})
