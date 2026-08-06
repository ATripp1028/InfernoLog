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

type ListItem = import('@infernolog/core').LevelProgressListItem

async function getList(userId: string): Promise<ListItem[]> {
  const res = await buildApp(progressApp, { userId }).request('/me/progress')
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: ListItem[] }
  return body.data
}

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

describe('GET /me/progress', () => {
  it('returns the three statuses with the representative update per level', async () => {
    const user = await seedUser(prisma) // SIMPLE mode by default
    await seedLevel(prisma, { inGameId: '100' })
    await seedLevel(prisma, { inGameId: '200' })
    await seedLevel(prisma, { inGameId: '300' })

    // Completed level: an older non-completion update + the completion. The
    // completion must win regardless of loggedAt order.
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '100',
      status: 'COMPLETED',
      simpleRating: 70,
      updates: [
        { loggedAt: new Date('2026-01-01'), percentage: 80 },
        {
          kind: 'COMPLETION',
          loggedAt: new Date('2025-12-01'),
          attempts: 12000,
        },
      ],
    })
    // In-progress level: two non-completion updates — latest loggedAt wins.
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '200',
      status: 'IN_PROGRESS',
      updates: [
        { loggedAt: new Date('2026-02-01'), percentage: 40 },
        { loggedAt: new Date('2026-03-01'), percentage: 65 },
      ],
    })
    // Dropped level with no updates → entry is null.
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '300',
      status: 'DROPPED',
    })

    const list = await getList(user.id)
    expect(list).toHaveLength(3)
    const byLevel = Object.fromEntries(list.map((r) => [r.level.inGameId, r]))

    const completed = byLevel['100']!
    expect(completed.status).toBe('COMPLETED')
    expect(completed.entry?.kind).toBe('COMPLETION')
    expect(completed.entry?.attempts).toBe(12000)
    expect(completed.overallRating).toBe(70) // SIMPLE → simpleRating
    // Completed classic level with no ClassicRanking row.
    expect(completed.needsPlacement).toBe(true)

    const inProgress = byLevel['200']!
    expect(inProgress.status).toBe('IN_PROGRESS')
    expect(inProgress.entry?.kind).toBe('PROGRESS')
    expect(inProgress.entry?.percentage).toBe(65) // latest update
    expect(inProgress.needsPlacement).toBe(false)

    const dropped = byLevel['300']!
    expect(dropped.status).toBe('DROPPED')
    expect(dropped.entry).toBeNull()
  })

  it('clears needsPlacement once a ClassicRanking row exists', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '101' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '101',
      status: 'COMPLETED',
      simpleRating: 50,
      updates: [{ kind: 'COMPLETION' }],
    })
    await prisma.classicRanking.create({
      data: { userId: user.id, levelProgressId: lp.id, rankingIndex: 1 },
    })

    const list = await getList(user.id)
    expect(list[0]?.needsPlacement).toBe(false)
  })

  it('computes the weighted-average overallRating in WEIGHTED mode', async () => {
    const user = await seedUser(prisma)
    // Two categories, weights 0.70 / 0.30.
    const gameplay = await seedRatingCategory(prisma, user.id, 'Gameplay', 0)
    const deco = await seedRatingCategory(prisma, user.id, 'Decoration', 1)
    await prisma.ratingCategory.update({
      where: { id: gameplay.id },
      data: { weight: 0.7 },
    })
    await prisma.ratingCategory.update({
      where: { id: deco.id },
      data: { weight: 0.3 },
    })
    await prisma.user.update({
      where: { id: user.id },
      data: { ratingMode: 'WEIGHTED' },
    })
    await seedLevel(prisma, { inGameId: '500' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '500',
      status: 'COMPLETED',
      // simpleRating should be ignored in WEIGHTED mode.
      simpleRating: 10,
      ratingScores: [
        { categoryId: gameplay.id, score: 80 },
        { categoryId: deco.id, score: 40 },
      ],
      updates: [{ kind: 'COMPLETION' }],
    })

    const list = await getList(user.id)
    // (80*0.7 + 40*0.3) / (0.7 + 0.3) = 68
    expect(list[0]?.overallRating).toBe(68)
  })

  it('returns only the authenticated user rows', async () => {
    const user = await seedUser(prisma)
    const other = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '600' })
    await seedLevel(prisma, { inGameId: '700' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '600',
      status: 'IN_PROGRESS',
      updates: [{ percentage: 20 }],
    })
    await seedProgress(prisma, {
      userId: other.id,
      levelId: '700',
      status: 'IN_PROGRESS',
      updates: [{ percentage: 20 }],
    })

    const list = await getList(user.id)
    expect(list).toHaveLength(1)
    expect(list[0]?.level.inGameId).toBe('600')
  })
})

describe('GET /me/progress/:levelId', () => {
  it('shows drop history in runsGraph and top-level fields for a level that was dropped and later completed', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '400' })

    await prisma.levelProgress.create({
      data: {
        userId: user.id,
        levelId: '400',
        status: 'COMPLETED',
        worstFail: 45,
        worstFailDate: new Date('2024-06-01'),
        progressUpdates: {
          create: [
            {
              kind: 'PROGRESS',
              percentage: 30,
              date: new Date('2024-05-01'),
              loggedAt: new Date('2024-05-01'),
            },
            {
              kind: 'DROP',
              date: new Date('2024-06-01'),
              notes: 'too hard at the time',
              attempts: 500,
              loggedAt: new Date('2024-06-01'),
            },
            {
              kind: 'COMPLETION',
              date: new Date('2024-12-25'),
              loggedAt: new Date('2024-12-25'),
            },
          ],
        },
      },
    })

    const res = await buildApp(progressApp, { userId: user.id }).request(
      '/me/progress/400'
    )
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as {
      data: {
        status: string
        progressUpdates: Array<{
          kind: string
          date: string | null
          notes: string | null
          attempts: number | null
        }>
        runsGraph: Array<{
          kind: string
          to: number
          droppedAfter: boolean
        }>
      }
    }

    // Drop metadata survives past completion — the API doesn't gate it on status.
    expect(data.status).toBe('COMPLETED')
    const drop = data.progressUpdates.find((u) => u.kind === 'DROP')
    expect(drop?.date).toContain('2024-06-01')
    expect(drop?.notes).toBe('too hard at the time')
    expect(drop?.attempts).toBe(500)

    // Two distinct bars (the pre-drop update flagged as dropped, then the worst-fail
    // milestone, then the completion) — not a duplicate synthetic bar for worstFail,
    // which would happen if the drop event's own worstFail weren't nulled out for a
    // COMPLETED level (see routes/progress/levelPage.ts).
    expect(data.runsGraph).toHaveLength(3)
    expect(data.runsGraph[0]).toMatchObject({
      kind: 'from_zero',
      to: 30,
      droppedAfter: true,
    })
    expect(data.runsGraph[1]).toMatchObject({ kind: 'worst_fail', to: 45 })
    expect(data.runsGraph[2]).toMatchObject({
      kind: 'completion',
      to: 100,
      droppedAfter: false,
    })
  })

  it('omits drop history from runsGraph and top-level fields when the level was never dropped', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '401' })
    await prisma.levelProgress.create({
      data: {
        userId: user.id,
        levelId: '401',
        status: 'COMPLETED',
        progressUpdates: { create: [{ kind: 'COMPLETION' }] },
      },
    })

    const res = await buildApp(progressApp, { userId: user.id }).request(
      '/me/progress/401'
    )
    const { data } = (await res.json()) as {
      data: {
        progressUpdates: Array<{ kind: string }>
        runsGraph: Array<{ kind: string; droppedAfter: boolean }>
      }
    }
    expect(data.progressUpdates.some((u) => u.kind === 'DROP')).toBe(false)
    expect(data.runsGraph.every((e) => !e.droppedAfter)).toBe(true)
    expect(data.runsGraph.map((e) => e.kind)).toEqual(['completion'])
  })
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

  it('reverts status and removes the classic ranking when the completion is deleted', async () => {
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
    await prisma.classicRanking.create({
      data: { userId: user.id, levelProgressId: lp.id, rankingIndex: 1 },
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
      await prisma.classicRanking.findUnique({
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
