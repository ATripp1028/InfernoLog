import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
  seedRatingCategory,
} from '../test/utils'

vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: loggingApp } = await import('./logging')

const prisma = getTestPrisma()

function post(userId: string, path: string, payload: unknown) {
  return buildApp(loggingApp, { userId }).request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('POST /me/completions', () => {
  it('creates level_progress (completed) + completion update + rating_scores + list_references', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, {
      inGameId: '100',
      inGameDifficulty: 'Insane Demon',
    })
    const category = await seedRatingCategory(prisma, user.id)

    const res = await post(user.id, '/me/completions', {
      levelId: '100',
      date: '2026-06-01',
      attempts: 12000,
      difficultyOpinion: 'EXTREME',
      enjoyment: 90,
      ratingScores: [{ categoryId: category.id, score: 75 }],
      listReferences: [
        { listSource: 'GDDL', tierOrRank: '28', atTimeOfLogging: true },
      ],
      videoUrl: 'https://youtu.be/abc',
    })

    expect(res.status).toBe(201)

    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '100' } },
      include: {
        progressUpdates: {
          include: { ratingScores: true, listReferences: true },
        },
      },
    })
    expect(lp.status).toBe('COMPLETED')
    expect(lp.progressUpdates).toHaveLength(1)
    const pu = lp.progressUpdates[0]
    if (!pu) throw new Error('expected a completion update')
    expect(pu.isCompletion).toBe(true)
    expect(pu.attempts).toBe(12000)
    expect(pu.difficultyOpinion).toBe('EXTREME')
    // In-game difficulty is snapshotted from the cached level, not the client.
    expect(pu.inGameDifficulty).toBe('Insane Demon')
    expect(pu.ratingScores).toHaveLength(1)
    expect(pu.ratingScores[0]?.score).toBe(75)
    expect(pu.listReferences).toHaveLength(1)
    expect(pu.listReferences[0]?.listSource).toBe('GDDL')
  })

  it('edits the existing completion in place rather than creating a second one', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '101' })
    const category = await seedRatingCategory(prisma, user.id)

    await post(user.id, '/me/completions', {
      levelId: '101',
      attempts: 1000,
      ratingScores: [{ categoryId: category.id, score: 50 }],
    })
    const res2 = await post(user.id, '/me/completions', {
      levelId: '101',
      attempts: 2000,
      ratingScores: [{ categoryId: category.id, score: 90 }],
    })

    expect(res2.status).toBe(201)

    const completions = await prisma.progressUpdate.findMany({
      where: {
        levelProgress: { userId: user.id, levelId: '101' },
        isCompletion: true,
      },
      include: { ratingScores: true },
    })
    // Still exactly one completion — updated, not duplicated.
    expect(completions).toHaveLength(1)
    const completion = completions[0]
    if (!completion) throw new Error('expected a completion update')
    expect(completion.attempts).toBe(2000)
    // Child rows were replaced, not accumulated.
    expect(completion.ratingScores).toHaveLength(1)
    expect(completion.ratingScores[0]?.score).toBe(90)
  })
})

describe('POST /me/progress', () => {
  it('persists a From-0% best-progress value (floor 0)', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '200' })

    const res = await post(user.id, '/me/progress', {
      mode: 'from_zero',
      levelId: '200',
      percentage: 0,
      attempts: 300,
    })

    expect(res.status).toBe(201)
    const pu = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgress: { userId: user.id, levelId: '200' } },
    })
    expect(pu.isCompletion).toBe(false)
    expect(Number(pu.percentage)).toBe(0)
    expect(pu.runFrom).toBeNull()
  })

  it('persists a From-a-run segment', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '201' })

    const res = await post(user.id, '/me/progress', {
      mode: 'from_run',
      levelId: '201',
      runFrom: 44,
      runTo: 87,
    })

    expect(res.status).toBe(201)
    const pu = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgress: { userId: user.id, levelId: '201' } },
    })
    expect(pu.runFrom).toBe(44)
    expect(pu.runTo).toBe(87)
    expect(pu.percentage).toBeNull()
  })

  it('flips a dropped level back to in_progress when progress is logged', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '202' })
    await prisma.levelProgress.create({
      data: { userId: user.id, levelId: '202', status: 'DROPPED' },
    })

    const res = await post(user.id, '/me/progress', {
      mode: 'from_zero',
      levelId: '202',
      percentage: 30,
    })

    expect(res.status).toBe(201)
    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '202' } },
    })
    expect(lp.status).toBe('IN_PROGRESS')
  })
})

describe('POST /me/drops', () => {
  it('drops a never-logged level from scratch, creating level_progress at status=dropped', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '300' })

    const res = await post(user.id, '/me/drops', {
      levelId: '300',
      droppedAt: '2026-06-10',
      attemptsAtDrop: 8000,
      droppedReason: 'too hard for now',
    })

    expect(res.status).toBe(201)
    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '300' } },
    })
    expect(lp.status).toBe('DROPPED')
    expect(lp.attemptsAtDrop).toBe(8000)
    expect(lp.droppedReason).toBe('too hard for now')
  })
})

describe('auth — user comes from the JWT, not the payload', () => {
  it('logs under the authenticated user even if a different userId is in the body', async () => {
    const authedUser = await seedUser(prisma)
    const otherUser = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '400' })

    const res = await post(authedUser.id, '/me/drops', {
      // Attempt to write to someone else's data via the payload.
      userId: otherUser.id,
      levelId: '400',
      droppedAt: '2026-06-10',
    })

    expect(res.status).toBe(201)
    // The row belongs to the JWT user, never the payload's userId.
    const authedRow = await prisma.levelProgress.findUnique({
      where: { userId_levelId: { userId: authedUser.id, levelId: '400' } },
    })
    expect(authedRow).not.toBeNull()
    const otherRow = await prisma.levelProgress.findUnique({
      where: { userId_levelId: { userId: otherUser.id, levelId: '400' } },
    })
    expect(otherRow).toBeNull()
  })
})
