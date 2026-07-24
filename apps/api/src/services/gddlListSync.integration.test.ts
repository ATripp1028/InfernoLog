/**
 * Integration tests for syncGddlLists (services/gddlListSync.ts). All Prisma
 * calls hit the local test database (started by globalSetup). GDDL and
 * RobTop HTTP calls are mocked so the tests run without network access.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma, seedUser, truncateAll } from '../test/utils'
import type { RobtopLevel } from '../utils/robtop'

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../utils/gddl', () => ({
  fetchGddlUserInfo: vi.fn(async () => ({ id: 17251, name: 'TestUser' })),
  fetchGddlList: vi.fn(async () => [] as string[]),
  addGddlListEntry: vi.fn(async () => {}),
  removeGddlListEntry: vi.fn(async () => {}),
}))

vi.mock('../utils/robtop', () => ({
  fetchRobtopLevel: vi.fn(async () => null),
}))

// Import after vi.mock so that gddlListSync picks up the mocked modules.
const { syncGddlLists } = await import('./gddlListSync')
const { fetchGddlList } = await import('../utils/gddl')
const { fetchRobtopLevel } = await import('../utils/robtop')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = getTestPrisma()
const mockFetchGddlList = fetchGddlList as unknown as ReturnType<typeof vi.fn>
const mockFetchRobtop = fetchRobtopLevel as unknown as ReturnType<typeof vi.fn>

// A full RobtopLevel with only the diff-relevant fields worth setting; the
// rest default to null/false.
function makeRobtop(overrides: Partial<RobtopLevel> = {}): RobtopLevel {
  return {
    name: 'Fresh Name',
    creator: 'Fresh Creator',
    inGameDifficulty: 'Insane Demon',
    length: null,
    songName: null,
    songAuthor: null,
    isRated: true,
    isDemon: true,
    platformer: false,
    description: null,
    creatorPlayerId: null,
    creatorAccountId: null,
    stars: null,
    starsRequested: null,
    partialDiff: null,
    downloads: null,
    likes: null,
    disliked: null,
    objectCount: null,
    coins: null,
    coinsVerified: null,
    featured: null,
    featureScore: null,
    epicValue: null,
    twoPlayer: null,
    lowDetailMode: null,
    copiedFromId: null,
    levelVersion: null,
    gameVersion: null,
    officialSongId: null,
    songId: null,
    songLink: null,
    songSize: null,
    ...overrides,
  }
}

async function seedFavoritesCollection(userId: string) {
  return prisma.collection.create({
    data: { userId, name: 'Favorites', type: 'FAVORITES' },
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockFetchGddlList.mockImplementation(async () => [])
  mockFetchRobtop.mockImplementation(async () => null)
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── tests ────────────────────────────────────────────────────────────────────

describe('syncGddlLists', () => {
  it('re-fetches and upgrades a stub left behind by a prior import instead of treating it as already seeded', async () => {
    const user = await seedUser(prisma)
    await seedFavoritesCollection(user.id)
    // Simulates a level a previous GDDL/import flow created when RobTop was
    // unreachable — it exists in the DB but was never actually enriched.
    await prisma.level.create({
      data: { inGameId: '12345', dataSource: 'manual', verified: false },
    })

    // GDDL favorites list references it; RobTop is reachable again this time.
    mockFetchGddlList.mockImplementation(async (_apiKey, _userId, list) =>
      list === 'favorites' ? ['12345'] : []
    )
    mockFetchRobtop.mockResolvedValueOnce(makeRobtop())

    const result = await syncGddlLists(user.id, 'api-key')

    expect(result.favorites.addedToInferno).toEqual(['12345'])
    expect(result.favorites.skipped).toEqual([])

    const level = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '12345' },
    })
    expect(level.verified).toBe(true)
    expect(level.dataSource).toBe('robtop_autofill')
    expect(level.name).toBe('Fresh Name')
  })

  it('leaves a still-unreachable stub in place but keeps it usable', async () => {
    const user = await seedUser(prisma)
    await seedFavoritesCollection(user.id)
    await prisma.level.create({
      data: { inGameId: '12345', dataSource: 'manual', verified: false },
    })

    mockFetchGddlList.mockImplementation(async (_apiKey, _userId, list) =>
      list === 'favorites' ? ['12345'] : []
    )
    // RobTop is still down.
    mockFetchRobtop.mockResolvedValueOnce(null)

    const result = await syncGddlLists(user.id, 'api-key')

    expect(result.favorites.addedToInferno).toEqual(['12345'])
    expect(result.favorites.skipped).toEqual([])

    const level = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '12345' },
    })
    expect(level.verified).toBe(false)
    expect(level.dataSource).toBe('manual')
  })

  it('does not re-fetch a level that is already verified', async () => {
    const user = await seedUser(prisma)
    await seedFavoritesCollection(user.id)
    await prisma.level.create({
      data: {
        inGameId: '12345',
        name: 'Already Cached',
        dataSource: 'robtop_autofill',
        verified: true,
      },
    })

    mockFetchGddlList.mockImplementation(async (_apiKey, _userId, list) =>
      list === 'favorites' ? ['12345'] : []
    )

    const result = await syncGddlLists(user.id, 'api-key')

    expect(result.favorites.addedToInferno).toEqual(['12345'])
    expect(mockFetchRobtop).not.toHaveBeenCalled()

    const level = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '12345' },
    })
    expect(level.name).toBe('Already Cached') // untouched
  })
})
