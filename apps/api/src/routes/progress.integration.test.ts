import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
  seedRatingCategory,
} from '../test/utils'

// Real DB; mock only Sentry + logger (no external HTTP in this read path).
vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: progressApp } = await import('./progress')

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

// Helper: create a level_progress row with progress updates inline.
async function seedProgress(
  db: PrismaClient,
  args: {
    userId: string
    levelId: string
    status: 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
    updates?: Array<{
      isCompletion?: boolean
      loggedAt?: Date
      simpleRating?: number | null
      enjoyment?: number | null
      percentage?: number | null
      attempts?: number | null
      ratingScores?: Array<{ categoryId: string; score: number }>
      listReferences?: Array<{ listSource: 'GDDL'; tierOrRank: string }>
    }>
  }
) {
  return db.levelProgress.create({
    data: {
      userId: args.userId,
      levelId: args.levelId,
      status: args.status,
      progressUpdates: {
        create: (args.updates ?? []).map((u) => ({
          isCompletion: u.isCompletion ?? false,
          loggedAt: u.loggedAt,
          simpleRating: u.simpleRating ?? null,
          enjoyment: u.enjoyment ?? null,
          percentage: u.percentage ?? null,
          attempts: u.attempts ?? null,
          ratingScores: u.ratingScores ? { create: u.ratingScores } : undefined,
          listReferences: u.listReferences
            ? {
                create: u.listReferences.map((r) => ({
                  listSource: r.listSource,
                  tierOrRank: r.tierOrRank,
                })),
              }
            : undefined,
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
      updates: [
        { loggedAt: new Date('2026-01-01'), percentage: 80 },
        {
          isCompletion: true,
          loggedAt: new Date('2025-12-01'),
          simpleRating: 70,
          attempts: 12000,
          listReferences: [{ listSource: 'GDDL', tierOrRank: '28' }],
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
    expect(completed.entry?.isCompletion).toBe(true)
    expect(completed.entry?.attempts).toBe(12000)
    expect(completed.entry?.overallRating).toBe(70) // SIMPLE → simpleRating
    // Completed classic level with no ClassicRanking row.
    expect(completed.needsPlacement).toBe(true)

    const inProgress = byLevel['200']!
    expect(inProgress.status).toBe('IN_PROGRESS')
    expect(inProgress.entry?.isCompletion).toBe(false)
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
      updates: [{ isCompletion: true, simpleRating: 50 }],
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
      updates: [
        {
          isCompletion: true,
          // simpleRating should be ignored in WEIGHTED mode.
          simpleRating: 10,
          ratingScores: [
            { categoryId: gameplay.id, score: 80 },
            { categoryId: deco.id, score: 40 },
          ],
        },
      ],
    })

    const list = await getList(user.id)
    // (80*0.7 + 40*0.3) / (0.7 + 0.3) = 68
    expect(list[0]?.entry?.overallRating).toBe(68)
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

describe('DELETE /me/progress/:levelId', () => {
  it('deletes the entry and cascades to updates + children', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '900' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '900',
      status: 'COMPLETED',
      updates: [
        {
          isCompletion: true,
          simpleRating: 70,
          listReferences: [{ listSource: 'GDDL', tierOrRank: '20' }],
        },
      ],
    })
    const pu = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
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
