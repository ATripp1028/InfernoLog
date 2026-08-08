import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
  seedRatingCategory,
} from '../../test/utils'

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { default: loggingApp } = await import('./index')

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
  it('creates level_progress (completed) + completion update + rating_scores', async () => {
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
      userGddlTier: 28,
      videoUrl: 'https://youtu.be/abc',
    })

    expect(res.status).toBe(201)

    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '100' } },
      include: {
        progressUpdates: true,
        ratingScores: true,
      },
    })
    expect(lp.status).toBe('COMPLETED')
    expect(lp.progressUpdates).toHaveLength(1)
    const pu = lp.progressUpdates[0]
    if (!pu) throw new Error('expected a completion update')
    expect(pu.kind).toBe('COMPLETION')
    expect(pu.attempts).toBe(12000)
    expect(pu.difficultyOpinion).toBe('EXTREME')
    // In-game difficulty is snapshotted from the cached level, not the client.
    expect(pu.inGameDifficulty).toBe('Insane Demon')
    // Rating scores live on LevelProgress — one current set per level.
    expect(lp.ratingScores).toHaveLength(1)
    expect(lp.ratingScores[0]?.score).toBe(75)
    expect(lp.userGddlTier).toBe(28)
  })

  it('persists dateTimezone/worstFailDateTimezone alongside a real time-of-day', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '102' })

    const res = await post(user.id, '/me/completions', {
      levelId: '102',
      date: '2026-06-01T23:30:00.000Z',
      dateTimezone: 'America/New_York',
      worstFail: 45,
      worstFailDate: '2026-05-30T10:00:00.000Z',
      worstFailDateTimezone: 'America/New_York',
    })
    expect(res.status).toBe(201)

    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '102' } },
      include: { progressUpdates: true },
    })
    expect(lp.worstFailDateTimezone).toBe('America/New_York')
    const pu = lp.progressUpdates[0]
    if (!pu) throw new Error('expected a completion update')
    expect(pu.dateTimezone).toBe('America/New_York')
  })

  it('stores dateTimezone/worstFailDateTimezone as null when only a bare date is sent (legacy shape)', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '103' })

    const res = await post(user.id, '/me/completions', {
      levelId: '103',
      date: '2026-06-01',
      worstFail: 20,
      worstFailDate: '2026-05-30',
    })
    expect(res.status).toBe(201)

    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '103' } },
      include: { progressUpdates: true },
    })
    expect(lp.worstFailDateTimezone).toBeNull()
    const pu = lp.progressUpdates[0]
    if (!pu) throw new Error('expected a completion update')
    expect(pu.dateTimezone).toBeNull()
    expect(pu.date?.toISOString()).toContain('2026-06-01')
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
        kind: 'COMPLETION',
      },
    })
    // Still exactly one completion — updated, not duplicated.
    expect(completions).toHaveLength(1)
    const completion = completions[0]
    if (!completion) throw new Error('expected a completion update')
    expect(completion.attempts).toBe(2000)

    // Rating-score rows (on LevelProgress) were replaced, not accumulated.
    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '101' } },
      include: { ratingScores: true },
    })
    expect(lp.ratingScores).toHaveLength(1)
    expect(lp.ratingScores[0]?.score).toBe(90)
  })
})

describe('POST /me/progress', () => {
  it('rejects a From-0% best-progress value — 0% is not a run', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '200' })

    const res = await post(user.id, '/me/progress', {
      mode: 'from_zero',
      levelId: '200',
      percentage: 0,
      attempts: 300,
    })

    expect(res.status).toBe(400)
    const pu = await prisma.progressUpdate.findFirst({
      where: { levelProgress: { userId: user.id, levelId: '200' } },
    })
    expect(pu).toBeNull()
  })

  it('persists a From-0% best-progress value at the lowest valid floor (1%)', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '200' })

    const res = await post(user.id, '/me/progress', {
      mode: 'from_zero',
      levelId: '200',
      percentage: 1,
      attempts: 300,
    })

    expect(res.status).toBe(201)
    const pu = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgress: { userId: user.id, levelId: '200' } },
    })
    expect(pu.kind).toBe('PROGRESS')
    expect(Number(pu.percentage)).toBe(1)
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
      date: '2026-06-10',
      attempts: 8000,
      notes: 'too hard for now',
    })

    expect(res.status).toBe(201)
    const lp = await prisma.levelProgress.findUniqueOrThrow({
      where: { userId_levelId: { userId: user.id, levelId: '300' } },
      include: { progressUpdates: true },
    })
    expect(lp.status).toBe('DROPPED')
    expect(lp.progressUpdates).toHaveLength(1)
    const drop = lp.progressUpdates[0]
    if (!drop) throw new Error('expected a drop update')
    expect(drop.kind).toBe('DROP')
    expect(drop.attempts).toBe(8000)
    expect(drop.notes).toBe('too hard for now')
  })

  it('persists dateTimezone on a drop when a real time-of-day is sent', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '301' })

    const res = await post(user.id, '/me/drops', {
      levelId: '301',
      date: '2026-06-10T14:15:00.000Z',
      dateTimezone: 'UTC',
    })

    expect(res.status).toBe(201)
    const drop = await prisma.progressUpdate.findFirstOrThrow({
      where: { levelProgress: { userId: user.id, levelId: '301' } },
    })
    expect(drop.dateTimezone).toBe('UTC')
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
      date: '2026-06-10',
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
