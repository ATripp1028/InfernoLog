/**
 * Integration tests for the shared RobTop sync core (services/levelSync.ts).
 * All Prisma calls hit the local test database (started by globalSetup); the
 * RobTop HTTP client is mocked so the tests run without network access.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma, truncateAll } from '../test/utils'
import type { RobtopLevel } from '../utils/robtop'

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@sentry/aws-serverless', () => ({ captureException: vi.fn() }))

vi.mock('../utils/robtop', () => ({ fetchRobtopLevel: vi.fn() }))

// Import after vi.mock so levelSync picks up the mocked modules.
const {
  syncLevelBatch,
  runVolatileSync,
  runStandardSync,
  VOLATILE_WINDOW_DAYS,
} = await import('./levelSync')
const { fetchRobtopLevel } = await import('../utils/robtop')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = getTestPrisma()
const robtopMock = fetchRobtopLevel as unknown as ReturnType<typeof vi.fn>

// A full RobtopLevel with only the diff-relevant fields worth setting; the rest
// default to null/false (the sync core never reads them).
function makeRobtop(overrides: Partial<RobtopLevel> = {}): RobtopLevel {
  return {
    name: 'Cached Name',
    creator: 'Cached Creator',
    inGameDifficulty: 'Insane Demon',
    length: null,
    songName: 'Cached Song',
    songAuthor: 'Cached Author',
    isRated: true,
    isDemon: true,
    platformer: false,
    description: null,
    creatorPlayerId: null,
    creatorAccountId: null,
    creatorPoints: null,
    stars: null,
    starsRequested: null,
    partialDiff: null,
    difficultyFace: null,
    downloads: null,
    likes: null,
    disliked: null,
    objectCount: null,
    largeLevel: null,
    coins: null,
    coinsVerified: null,
    orbs: null,
    diamonds: null,
    featured: null,
    featureScore: null,
    epicValue: null,
    twoPlayer: null,
    lowDetailMode: null,
    copiedFromId: null,
    levelVersion: null,
    gameVersion: null,
    editorSeconds: null,
    editorSecondsTotal: null,
    officialSongId: null,
    songId: null,
    songLink: null,
    songSize: null,
    ...overrides,
  }
}

// Seed a level row with the diff-relevant fields set to the "cached" values.
async function seedCachedLevel(overrides: Record<string, unknown> = {}) {
  return prisma.level.create({
    data: {
      inGameId: '100',
      name: 'Cached Name',
      creator: 'Cached Creator',
      inGameDifficulty: 'Insane Demon',
      songName: 'Cached Song',
      songAuthor: 'Cached Author',
      isRated: true,
      isDemon: true,
      dataSource: 'robtop_autofill',
      verified: true,
      ...overrides,
    },
  })
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

beforeEach(async () => {
  await truncateAll(prisma)
  robtopMock.mockReset()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── shared core: diff/write behavior ──────────────────────────────────────────

describe('syncLevelBatch — found, no diff', () => {
  it('updates only last_checked_at when nothing changed', async () => {
    await seedCachedLevel()
    robtopMock.mockResolvedValue(makeRobtop())

    const before = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.lastCheckedAt).not.toBeNull()
    expect(after.name).toBe('Cached Name')
    expect(after.creator).toBe('Cached Creator')
    expect(after.inGameDifficulty).toBe('Insane Demon')
    expect(after.isRated).toBe(true)
    expect(after.ratingStatusSince).toBeNull()
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime()
    )
    expect(result).toMatchObject({
      processed: 1,
      updated: 0,
      ratingChanged: 0,
      delisted: 0,
      errors: 0,
    })
  })
})

describe('syncLevelBatch — found, metadata diff', () => {
  it('overwrites name/creator/song directly without stamping rating_status_since', async () => {
    await seedCachedLevel()
    robtopMock.mockResolvedValue(
      makeRobtop({
        name: 'New Name',
        creator: 'New Creator',
        songName: 'New Song',
        songAuthor: 'New Author',
      })
    )

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.name).toBe('New Name')
    expect(after.creator).toBe('New Creator')
    expect(after.songName).toBe('New Song')
    expect(after.songAuthor).toBe('New Author')
    // Rating status untouched — metadata diffs don't drive the volatile window.
    expect(after.ratingStatusSince).toBeNull()
    expect(after.lastCheckedAt).not.toBeNull()
    expect(result).toMatchObject({ processed: 1, updated: 1, ratingChanged: 0 })
  })
})

describe('syncLevelBatch — found, rating diff', () => {
  it('stamps rating_status_since when is_rated flips', async () => {
    await seedCachedLevel({
      isRated: false,
      inGameDifficulty: 'Unrated',
      ratingStatusSince: null,
    })
    robtopMock.mockResolvedValue(
      makeRobtop({ isRated: true, inGameDifficulty: 'Insane Demon' })
    )

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.isRated).toBe(true)
    expect(after.inGameDifficulty).toBe('Insane Demon')
    expect(after.ratingStatusSince).not.toBeNull()
    expect(result).toMatchObject({ processed: 1, updated: 1, ratingChanged: 1 })
  })

  it('stamps rating_status_since when in_game_difficulty changes', async () => {
    await seedCachedLevel({
      inGameDifficulty: 'Hard Demon',
      ratingStatusSince: daysAgo(200),
    })
    robtopMock.mockResolvedValue(
      makeRobtop({ inGameDifficulty: 'Extreme Demon' })
    )

    await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.inGameDifficulty).toBe('Extreme Demon')
    // Re-stamped to ~now (well after the seeded 200-days-ago value).
    expect(after.ratingStatusSince!.getTime()).toBeGreaterThan(
      daysAgo(1).getTime()
    )
  })
})

describe('syncLevelBatch — not found (delisting)', () => {
  it('sets delisted/delisted_at and freezes all metadata, running no diff logic', async () => {
    await seedCachedLevel({ ratingStatusSince: daysAgo(3) })
    robtopMock.mockResolvedValue(null)

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.delisted).toBe(true)
    expect(after.delistedAt).not.toBeNull()
    // Metadata frozen at last-known values.
    expect(after.name).toBe('Cached Name')
    expect(after.creator).toBe('Cached Creator')
    expect(after.inGameDifficulty).toBe('Insane Demon')
    expect(after.songName).toBe('Cached Song')
    expect(after.songAuthor).toBe('Cached Author')
    expect(after.isRated).toBe(true)
    // rating_status_since is not re-stamped by the delisting path.
    expect(after.ratingStatusSince!.getTime()).toBeLessThan(
      daysAgo(1).getTime()
    )
    expect(result).toMatchObject({
      processed: 1,
      updated: 0,
      ratingChanged: 0,
      delisted: 1,
    })
  })
})

describe('syncLevelBatch — resilience', () => {
  it('counts a per-level failure and continues the batch', async () => {
    await seedCachedLevel({ inGameId: '100' })
    await seedCachedLevel({ inGameId: '200' })
    robtopMock
      .mockRejectedValueOnce(new Error('RobTop exploded'))
      .mockResolvedValueOnce(makeRobtop({ name: 'Second' }))

    const result = await syncLevelBatch(['100', '200'], 0)

    expect(result.errors).toBe(1)
    const second = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '200' },
    })
    expect(second.name).toBe('Second')
  })
})

// ─── query selection: which levels each job picks up ────────────────────────────

describe('runVolatileSync — selection', () => {
  it('includes never-rated and recently-rated levels, excludes old-rated and delisted', async () => {
    await seedCachedLevel({
      inGameId: 'never',
      isRated: false,
      ratingStatusSince: null,
    })
    await seedCachedLevel({
      inGameId: 'recent',
      isRated: true,
      ratingStatusSince: daysAgo(VOLATILE_WINDOW_DAYS - 1),
    })
    await seedCachedLevel({
      inGameId: 'old',
      isRated: true,
      ratingStatusSince: daysAgo(VOLATILE_WINDOW_DAYS + 30),
    })
    await seedCachedLevel({
      inGameId: 'gone',
      isRated: false,
      delisted: true,
      delistedAt: new Date(),
    })
    robtopMock.mockResolvedValue(makeRobtop())

    const result = await runVolatileSync()

    const seen = robtopMock.mock.calls.map((c) => c[0]).sort()
    expect(seen).toEqual(['never', 'recent'])
    expect(result.processed).toBe(2)
  })
})

describe('runStandardSync — selection', () => {
  it('includes rated levels outside the volatile window (old or null-stamped), excludes recent/unrated/delisted', async () => {
    await seedCachedLevel({
      inGameId: 'old',
      isRated: true,
      ratingStatusSince: daysAgo(VOLATILE_WINDOW_DAYS + 30),
    })
    await seedCachedLevel({
      inGameId: 'nullstamp',
      isRated: true,
      ratingStatusSince: null,
    })
    await seedCachedLevel({
      inGameId: 'recent',
      isRated: true,
      ratingStatusSince: daysAgo(VOLATILE_WINDOW_DAYS - 1),
    })
    await seedCachedLevel({
      inGameId: 'unrated',
      isRated: false,
      ratingStatusSince: null,
    })
    await seedCachedLevel({
      inGameId: 'gone',
      isRated: true,
      ratingStatusSince: daysAgo(100),
      delisted: true,
      delistedAt: new Date(),
    })
    robtopMock.mockResolvedValue(makeRobtop())

    const result = await runStandardSync()

    const seen = robtopMock.mock.calls.map((c) => c[0]).sort()
    expect(seen).toEqual(['nullstamp', 'old'])
    expect(result.processed).toBe(2)
  })

  it('does not reprocess anything the volatile job covers in the same window', async () => {
    // A recently-rated level is in volatile's set...
    await seedCachedLevel({
      inGameId: 'recent',
      isRated: true,
      ratingStatusSince: daysAgo(1),
    })
    robtopMock.mockResolvedValue(makeRobtop())

    await runVolatileSync()
    const volatileSeen = robtopMock.mock.calls.map((c) => c[0])
    robtopMock.mockClear()
    await runStandardSync()
    const standardSeen = robtopMock.mock.calls.map((c) => c[0])

    expect(volatileSeen).toContain('recent')
    // ...and therefore absent from standard's set — no double-processing.
    expect(standardSeen).not.toContain('recent')
  })
})
