/**
 * Unit tests for the bidirectional GDDL list sync.
 *
 * The asymmetry is the whole design and the easiest thing to break: GDDL caps
 * its non-custom lists at 4, so only the top 4 InfernoLog entries are mirrored
 * out and anything past that is removed FROM GDDL — while InfernoLog itself is
 * never truncated. The other load-bearing rule is that a GDDL level we cannot
 * cache is skipped rather than added, since a CollectionEntry needs a Level row
 * to FK against. Prisma, the GDDL client and RobTop are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const {
  mockFetchGddlUserInfo,
  mockFetchGddlList,
  mockAddGddlListEntry,
  mockRemoveGddlListEntry,
  mockFetchRobtopLevel,
} = vi.hoisted(() => ({
  mockFetchGddlUserInfo: vi.fn(),
  mockFetchGddlList: vi.fn(),
  mockAddGddlListEntry: vi.fn(),
  mockRemoveGddlListEntry: vi.fn(),
  mockFetchRobtopLevel: vi.fn(),
}))

vi.mock('../../utils/gddl', () => ({
  fetchGddlUserInfo: mockFetchGddlUserInfo,
  fetchGddlList: mockFetchGddlList,
  addGddlListEntry: mockAddGddlListEntry,
  removeGddlListEntry: mockRemoveGddlListEntry,
}))
vi.mock('../../utils/robtop', () => ({
  fetchRobtopLevel: mockFetchRobtopLevel,
}))
vi.mock('../levels/robtopMapping', () => ({
  buildRobtopCreateData: vi.fn((id: string) => ({ inGameId: id })),
  buildRobtopRefreshData: vi.fn(() => ({ verified: true })),
}))

const { syncGddlLists } = await import('./listSync')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = 'user-1'
const API_KEY = 'gddl-key'
const GDDL_USER_ID = 17251

/** The transaction client the entry-insert callback receives. */
const tx = {
  collectionEntry: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}

/**
 * Seeds both collections. `favorites` is the FAVORITES collection's entry
 * level ids in display order; least-favorites is always empty here so each
 * test reasons about one list.
 */
function seedCollections(favorites: string[]) {
  prisma.collection.findFirst.mockImplementation((async (args: {
    where: { type: string }
  }) =>
    args.where.type === 'FAVORITES'
      ? {
          id: 'col-fav',
          entries: favorites.map((levelId) => ({ levelId })),
        }
      : { id: 'col-least', entries: [] }) as never)
}

/** Seeds each GDDL list's contents. */
function seedGddlLists(favorites: string[], leastFavorites: string[] = []) {
  mockFetchGddlList.mockImplementation(
    async (_key: string, _id: number, list: string) =>
      list === 'favorites' ? favorites : leastFavorites
  )
}

/** Level ids handed to collectionEntry.create, in order. */
function createdEntries(): string[] {
  return tx.collectionEntry.create.mock.calls.map(
    (call) => (call[0] as { data: { levelId: string } }).data.levelId
  )
}

function run() {
  return syncGddlLists(USER_ID, API_KEY)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchGddlUserInfo.mockReset().mockResolvedValue({
    id: GDDL_USER_ID,
    name: 'Riot',
  })
  mockFetchGddlList.mockReset().mockResolvedValue([])
  mockAddGddlListEntry.mockReset().mockResolvedValue(undefined)
  mockRemoveGddlListEntry.mockReset().mockResolvedValue(undefined)
  mockFetchRobtopLevel.mockReset().mockResolvedValue({ name: 'Cached Level' })

  tx.collectionEntry.findUnique.mockReset().mockResolvedValue(null)
  tx.collectionEntry.findFirst.mockReset().mockResolvedValue(null)
  tx.collectionEntry.create.mockReset().mockResolvedValue({})

  prisma.collection.findFirst.mockReset()
  seedCollections([])
  prisma.level.findUnique.mockReset().mockResolvedValue(null)
  prisma.level.create.mockReset().mockResolvedValue({} as never)
  prisma.level.update.mockReset().mockResolvedValue({} as never)
  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )
})

// ─── Direction A: GDDL → InfernoLog ──────────────────────────────────────────

describe('syncGddlLists — GDDL to InfernoLog', () => {
  it('adds a GDDL level the collection is missing', async () => {
    seedGddlLists(['12345'])

    const result = await run()

    expect(result.favorites.addedToInferno).toEqual(['12345'])
    expect(createdEntries()).toEqual(['12345'])
  })

  it('leaves a level already in the collection alone', async () => {
    seedGddlLists(['12345'])
    seedCollections(['12345'])

    const result = await run()

    expect(result.favorites.addedToInferno).toEqual([])
    expect(tx.collectionEntry.create).not.toHaveBeenCalled()
  })

  it('skips — rather than adds — a level that cannot be cached', async () => {
    // A CollectionEntry needs a Level row to FK against, so an uncacheable id
    // must not be inserted.
    seedGddlLists(['99999'])
    mockFetchRobtopLevel.mockResolvedValue(null)

    const result = await run()

    expect(result.favorites.skipped).toEqual(['99999'])
    expect(result.favorites.addedToInferno).toEqual([])
    expect(tx.collectionEntry.create).not.toHaveBeenCalled()
  })

  it('skips a level whose caching attempt throws', async () => {
    seedGddlLists(['99999'])
    mockFetchRobtopLevel.mockRejectedValue(new Error('robtop down'))

    const result = await run()

    expect(result.favorites.skipped).toEqual(['99999'])
  })

  it('does not re-fetch a level already verified in the cache', async () => {
    seedGddlLists(['12345'])
    prisma.level.findUnique.mockResolvedValue({
      inGameId: '12345',
      verified: true,
    } as never)

    await run()

    expect(mockFetchRobtopLevel).not.toHaveBeenCalled()
    expect(createdEntries()).toEqual(['12345'])
  })

  it('upgrades an unverified stub in place when RobTop has data now', async () => {
    // "Row exists" is not "already handled" — the 2026-07 import left stubs
    // that never got their metadata.
    seedGddlLists(['12345'])
    prisma.level.findUnique.mockResolvedValue({
      inGameId: '12345',
      verified: false,
    } as never)

    await run()

    expect(prisma.level.update).toHaveBeenCalledWith({
      where: { inGameId: '12345' },
      data: { verified: true },
    })
  })

  it('keeps using a stub RobTop still cannot supply', async () => {
    seedGddlLists(['12345'])
    prisma.level.findUnique.mockResolvedValue({
      inGameId: '12345',
      verified: false,
    } as never)
    mockFetchRobtopLevel.mockResolvedValue(null)

    const result = await run()

    expect(prisma.level.update).not.toHaveBeenCalled()
    expect(result.favorites.addedToInferno).toEqual(['12345'])
  })

  it('tolerates a concurrent seed of the same level', async () => {
    // P2002 means another request won the race — the level is cached either
    // way, so the entry insert should still go ahead.
    seedGddlLists(['12345'])
    prisma.level.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      })
    )

    const result = await run()

    expect(result.favorites.addedToInferno).toEqual(['12345'])
  })

  it('propagates a non-unique failure from the level insert', async () => {
    seedGddlLists(['12345'])
    prisma.level.create.mockRejectedValue(new Error('connection lost'))

    const result = await run()

    // ensureLevelCached's caller catches and skips rather than aborting.
    expect(result.favorites.skipped).toEqual(['12345'])
  })

  it('does not insert a duplicate entry when one already exists', async () => {
    seedGddlLists(['12345'])
    tx.collectionEntry.findUnique.mockResolvedValue({ id: 'entry-1' })

    await run()

    expect(tx.collectionEntry.create).not.toHaveBeenCalled()
  })

  it('appends after the last entry rather than at the front', async () => {
    seedGddlLists(['12345'])
    // rankingIndex is a Decimal — bisectIndices does Decimal arithmetic on it.
    tx.collectionEntry.findFirst.mockResolvedValue({
      rankingIndex: new Prisma.Decimal(100),
    })

    await run()

    const { data } = tx.collectionEntry.create.mock.lastCall![0] as {
      data: { rankingIndex: unknown }
    }
    expect(Number(data.rankingIndex)).toBeGreaterThan(100)
  })

  it('returns an empty summary when the collection is missing', async () => {
    seedGddlLists(['12345'])
    prisma.collection.findFirst.mockResolvedValue(null)

    const result = await run()

    expect(result.favorites).toEqual({
      addedToInferno: [],
      addedToGddl: [],
      removedFromGddl: [],
      skipped: [],
    })
    expect(tx.collectionEntry.create).not.toHaveBeenCalled()
  })
})

// ─── Direction B: InfernoLog → GDDL ──────────────────────────────────────────

describe('syncGddlLists — InfernoLog to GDDL', () => {
  it('pushes local entries GDDL is missing', async () => {
    seedCollections(['1', '2'])

    const result = await run()

    expect(result.favorites.addedToGddl).toEqual(['1', '2'])
    expect(mockAddGddlListEntry).toHaveBeenCalledWith(
      API_KEY,
      GDDL_USER_ID,
      'favorites',
      '1'
    )
  })

  it('pushes only the top 4, since GDDL caps the list there', async () => {
    seedCollections(['1', '2', '3', '4', '5', '6'])

    const result = await run()

    expect(result.favorites.addedToGddl).toEqual(['1', '2', '3', '4'])
  })

  it('never truncates the InfernoLog side', async () => {
    // Only the GDDL mirror is capped; the local collection keeps everything.
    seedCollections(['1', '2', '3', '4', '5'])

    await run()

    expect(prisma.collectionEntry.deleteMany).not.toHaveBeenCalled()
    expect(tx.collectionEntry.create).not.toHaveBeenCalled()
  })

  it('removes from GDDL anything outside the local top 4', async () => {
    seedCollections(['1', '2', '3', '4', '5'])
    seedGddlLists(['5'])

    const result = await run()

    expect(result.favorites.removedFromGddl).toEqual(['5'])
    expect(mockRemoveGddlListEntry).toHaveBeenCalledWith(
      API_KEY,
      GDDL_USER_ID,
      'favorites',
      '5'
    )
  })

  it('leaves a GDDL entry that is inside the local top 4', async () => {
    seedCollections(['1', '2'])
    seedGddlLists(['1'])

    const result = await run()

    expect(result.favorites.removedFromGddl).toEqual([])
    expect(result.favorites.addedToGddl).toEqual(['2'])
  })

  it('carries on when one GDDL add fails', async () => {
    // One rejected entry must not abandon the rest of the sync.
    seedCollections(['1', '2'])
    mockAddGddlListEntry.mockRejectedValueOnce(new Error('GDDL 500'))

    const result = await run()

    expect(result.favorites.addedToGddl).toEqual(['2'])
  })

  it('carries on when one GDDL remove fails', async () => {
    seedCollections(['1'])
    seedGddlLists(['8', '9'])
    mockRemoveGddlListEntry.mockRejectedValueOnce(new Error('GDDL 500'))

    const result = await run()

    expect(result.favorites.removedFromGddl).toEqual(['9'])
  })
})

// ─── both lists ──────────────────────────────────────────────────────────────

describe('syncGddlLists — both lists', () => {
  it('syncs favorites and least-favorites against their own GDDL lists', async () => {
    seedGddlLists(['1'], ['2'])

    const result = await run()

    expect(result.favorites.addedToInferno).toEqual(['1'])
    expect(result.leastFavorites.addedToInferno).toEqual(['2'])
    expect(mockFetchGddlList).toHaveBeenCalledWith(
      API_KEY,
      GDDL_USER_ID,
      'favorites'
    )
    expect(mockFetchGddlList).toHaveBeenCalledWith(
      API_KEY,
      GDDL_USER_ID,
      'least-favorites'
    )
  })

  it('resolves the GDDL user id once, from the key', async () => {
    await run()

    expect(mockFetchGddlUserInfo).toHaveBeenCalledTimes(1)
    expect(mockFetchGddlUserInfo).toHaveBeenCalledWith(API_KEY)
  })

  it('propagates a failure to resolve the GDDL account', async () => {
    // Routes map this to a 502 — it must not look like an empty sync.
    mockFetchGddlUserInfo.mockRejectedValue(new Error('GDDL unavailable'))

    await expect(run()).rejects.toThrow('GDDL unavailable')
  })
})
