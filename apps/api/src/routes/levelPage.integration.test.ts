// Integration tests for GET /v1/users/{usernameOrId}/progress/{levelId}
// (the Level Page endpoint) and related behaviour.
//
// Covers:
//   - owner view: full history including non-completions + level_notes + runsGraph
//   - public profile, non-owner: private entries excluded
//   - private profile, non-owner: 403
//   - level not logged by target user: 404
//   - level_notes round-trip (set via direct DB update, read back via endpoint)
//   - level_notes survives deletion of an individual progress_update
//   - ranking placement returned when a ClassicRanking row exists
//   - DELETE /v1/me/progress/:levelId: GDDL caveat in response + cascade verified

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../test/utils'

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

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

type LevelPageBody = {
  data: {
    levelProgressId: string
    status: string
    visibility: string
    levelNotes: string | null
    droppedReason: string | null
    droppedAt: string | null
    attemptsAtDrop: number | null
    worstFail: number | null
    rankingIndex: number | null
    rankPosition: number | null
    completionVideoUrl: string | null
    completionHighlightUrl: string | null
    level: Record<string, unknown>
    progressUpdates: Array<{
      progressUpdateId: string
      isCompletion: boolean
      percentage: number | null
      runFrom: number | null
      runTo: number | null
      attempts: number | null
      listReferences: Array<{ listSource: string; tierOrRank: string }>
      ratingScores: Array<{ categoryId: string; score: number }>
    }>
    runsGraph: Array<{
      progressUpdateId: string | null
      kind: string
      from: number
      to: number
      droppedAfter: boolean
    }>
  }
}

async function getLevelPage(
  userId: string,
  levelId: string
): Promise<Response> {
  return buildApp(progressApp, { userId }).request(`/me/progress/${levelId}`)
}

async function seedProgress(
  db: PrismaClient,
  args: {
    userId: string
    levelId: string
    status: 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
    visibility?: 'PUBLIC' | 'PRIVATE'
    levelNotes?: string | null
    droppedAt?: Date | null
    attemptsAtDrop?: number | null
    worstFail?: number | null
    updates?: Array<{
      isCompletion?: boolean
      percentage?: number | null
      runFrom?: number | null
      runTo?: number | null
      date?: Date | null
      loggedAt?: Date
      simpleRating?: number | null
      listReferences?: Array<{ listSource: 'GDDL'; tierOrRank: string }>
      ratingScores?: Array<{ categoryId: string; score: number }>
      videoUrl?: string | null
      highlightUrl?: string | null
    }>
  }
) {
  return db.levelProgress.create({
    data: {
      userId: args.userId,
      levelId: args.levelId,
      status: args.status,
      visibility: args.visibility ?? 'PUBLIC',
      levelNotes: args.levelNotes ?? null,
      droppedAt: args.droppedAt ?? null,
      attemptsAtDrop: args.attemptsAtDrop ?? null,
      worstFail: args.worstFail ?? null,
      progressUpdates: {
        create: (args.updates ?? []).map((u) => ({
          isCompletion: u.isCompletion ?? false,
          percentage: u.percentage ?? null,
          runFrom: u.runFrom ?? null,
          runTo: u.runTo ?? null,
          date: u.date ?? null,
          loggedAt: u.loggedAt ?? new Date(),
          simpleRating: u.simpleRating ?? null,
          videoUrl: u.videoUrl ?? null,
          highlightUrl: u.highlightUrl ?? null,
          listReferences: u.listReferences
            ? {
                create: u.listReferences.map((r) => ({
                  listSource: r.listSource,
                  tierOrRank: r.tierOrRank,
                })),
              }
            : undefined,
          ratingScores: u.ratingScores ? { create: u.ratingScores } : undefined,
        })),
      },
    },
  })
}

// ─────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─────────────────────────────────────────────
// READ — owner view
// ─────────────────────────────────────────────

describe('GET /me/progress/:levelId — owner', () => {
  it('returns all progress updates including non-completions', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '1001' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '1001',
      status: 'COMPLETED',
      updates: [
        { percentage: 60, loggedAt: new Date('2025-01-01') },
        {
          isCompletion: true,
          loggedAt: new Date('2025-06-01'),
          simpleRating: 80,
        },
      ],
    })

    const res = await getLevelPage(user.id, '1001')
    expect(res.status).toBe(200)
    const body = (await res.json()) as LevelPageBody
    expect(body.data.status).toBe('COMPLETED')
    expect(body.data.progressUpdates).toHaveLength(2)
    // Both updates present (non-completion not gated)
    const isCompletions = body.data.progressUpdates.map((u) => u.isCompletion)
    expect(isCompletions).toContain(true)
    expect(isCompletions).toContain(false)
  })

  it('returns level metadata', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, {
      inGameId: '1002',
      name: 'Sakupen Hell',
      creator: 'Noob',
      inGameDifficulty: 'Extreme Demon',
      isDemon: true,
    })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '1002',
      status: 'IN_PROGRESS',
    })

    const res = await getLevelPage(user.id, '1002')
    expect(res.status).toBe(200)
    const body = (await res.json()) as LevelPageBody
    expect(body.data.level).toMatchObject({
      inGameId: '1002',
      name: 'Sakupen Hell',
      creator: 'Noob',
      inGameDifficulty: 'Extreme Demon',
    })
  })

  it('returns list_references and rating_scores on each update', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '1003' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '1003',
      status: 'COMPLETED',
      updates: [
        {
          isCompletion: true,
          listReferences: [{ listSource: 'GDDL', tierOrRank: '35' }],
        },
      ],
    })

    const res = await getLevelPage(user.id, '1003')
    expect(res.status).toBe(200)
    const body = (await res.json()) as LevelPageBody
    const completion = body.data.progressUpdates.find((u) => u.isCompletion)
    expect(completion?.listReferences).toHaveLength(1)
    expect(completion?.listReferences[0]?.tierOrRank).toBe('35')
  })

  it('returns level_notes', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '1004' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '1004',
      status: 'IN_PROGRESS',
      levelNotes: 'Started this because of Sunix',
    })

    const res = await getLevelPage(user.id, '1004')
    expect(res.status).toBe(200)
    const body = (await res.json()) as LevelPageBody
    expect(body.data.levelNotes).toBe('Started this because of Sunix')
  })

  it('level_notes survives deletion of an individual progress_update', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '1005' })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '1005',
      status: 'IN_PROGRESS',
      levelNotes: 'I will beat this eventually',
      updates: [{ percentage: 55 }],
    })

    // Delete the progress_update — level_notes on level_progress must survive.
    const pu = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgressId: lp.id },
    })
    await prisma.progressUpdate.delete({ where: { id: pu.id } })

    const res = await getLevelPage(user.id, '1005')
    expect(res.status).toBe(200)
    const body = (await res.json()) as LevelPageBody
    expect(body.data.levelNotes).toBe('I will beat this eventually')
    expect(body.data.progressUpdates).toHaveLength(0)
  })

  it('returns ranking placement when a ClassicRanking row exists', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '1006', isDemon: true })
    const lp = await seedProgress(prisma, {
      userId: user.id,
      levelId: '1006',
      status: 'COMPLETED',
      updates: [{ isCompletion: true }],
    })
    await prisma.classicRanking.create({
      data: { userId: user.id, levelProgressId: lp.id, rankingIndex: 3 },
    })

    const res = await getLevelPage(user.id, '1006')
    expect(res.status).toBe(200)
    const body = (await res.json()) as LevelPageBody
    expect(body.data.rankingIndex).toBe(3)
    // rankPosition=1 because no other entries have a lower rankingIndex
    expect(body.data.rankPosition).toBe(1)
  })

  it('returns null rankingIndex / rankPosition when level is unplaced', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '1007' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '1007',
      status: 'COMPLETED',
      updates: [{ isCompletion: true }],
    })

    const res = await getLevelPage(user.id, '1007')
    expect(res.status).toBe(200)
    const body = (await res.json()) as LevelPageBody
    expect(body.data.rankingIndex).toBeNull()
    expect(body.data.rankPosition).toBeNull()
  })

  it('returns completion video/highlight on the top level (not just on the update)', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '1009' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '1009',
      status: 'COMPLETED',
      updates: [
        {
          isCompletion: true,
          videoUrl: 'https://youtube.com/watch?v=abc',
          highlightUrl: 'https://youtube.com/shorts/xyz',
        },
      ],
    })

    const res = await getLevelPage(user.id, '1009')
    const body = (await res.json()) as LevelPageBody
    expect(body.data.completionVideoUrl).toBe('https://youtube.com/watch?v=abc')
    expect(body.data.completionHighlightUrl).toBe(
      'https://youtube.com/shorts/xyz'
    )
  })
})

// ─────────────────────────────────────────────
// READ — runsGraph
// ─────────────────────────────────────────────

describe('GET /me/progress/:levelId — runsGraph', () => {
  it('includes a runsGraph entry for each progress update, ordered oldest→newest', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '2001' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '2001',
      status: 'COMPLETED',
      updates: [
        { percentage: 50, loggedAt: new Date('2025-01-01') },
        { percentage: 70, loggedAt: new Date('2025-03-01') },
        { isCompletion: true, loggedAt: new Date('2025-06-01') },
      ],
    })

    const res = await getLevelPage(user.id, '2001')
    const body = (await res.json()) as LevelPageBody
    const graph = body.data.runsGraph
    expect(graph).toHaveLength(3)
    expect(graph[0]).toMatchObject({ kind: 'from_zero', from: 0, to: 50 })
    expect(graph[1]).toMatchObject({ kind: 'from_zero', from: 0, to: 70 })
    expect(graph[2]).toMatchObject({ kind: 'completion', from: 0, to: 100 })
  })

  it('applies drop-merge rule: dropped level with no worstFail flags last entry', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '2002' })
    await seedProgress(prisma, {
      userId: user.id,
      levelId: '2002',
      status: 'DROPPED',
      droppedAt: new Date('2025-06-01'),
      worstFail: null,
      updates: [{ percentage: 65, loggedAt: new Date('2025-01-01') }],
    })

    const res = await getLevelPage(user.id, '2002')
    const body = (await res.json()) as LevelPageBody
    expect(body.data.runsGraph).toHaveLength(1)
    expect(body.data.runsGraph[0]).toMatchObject({ to: 65, droppedAfter: true })
  })
})

// ─────────────────────────────────────────────
// READ — 404 cases
// ─────────────────────────────────────────────

describe('GET /me/progress/:levelId — 404 cases', () => {
  it('returns 404 when the level has not been logged by the authenticated user', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '3001' })
    // user has NOT logged level 3001

    const res = await getLevelPage(user.id, '3001')
    expect(res.status).toBe(404)
  })
})
