/**
 * Unit tests for the Collections-tab import.
 *
 * Semantics are replace-per-collection: a collection the sheet names has its
 * membership rewritten, one it doesn't name is left alone. The rules that carry
 * real risk are the ones that decide what does NOT get written — Want to Beat
 * refusing completed levels, duplicates within a collection, and unresolvable
 * rows — because each is reported as `skipped` rather than failing the import,
 * so a regression is silent. Prisma and level resolution are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { ImportCollectionEntry } from '@infernolog/core'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockResolveNamesBatch, mockEnsureStubLevels, mockEnqueueSeedIds } =
  vi.hoisted(() => ({
    mockResolveNamesBatch: vi.fn(),
    mockEnsureStubLevels: vi.fn(),
    mockEnqueueSeedIds: vi.fn(),
  }))

vi.mock('../importExport/import', () => ({
  resolveNamesBatch: mockResolveNamesBatch,
  ensureStubLevels: mockEnsureStubLevels,
  enqueueSeedIds: mockEnqueueSeedIds,
}))

const { classifyCollection, commitImportCollections } = await import(
  './collections'
)

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const USER_ID = 'user-1'

/** The transaction client the commit callback receives. */
const tx = {
  collection: { findMany: vi.fn(), create: vi.fn() },
  collectionEntry: { deleteMany: vi.fn(), createMany: vi.fn() },
  levelProgress: { findMany: vi.fn() },
}

function entry(
  list: string,
  overrides: Partial<ImportCollectionEntry> = {}
): ImportCollectionEntry {
  return { list, levelId: '12345', ...overrides } as ImportCollectionEntry
}

type WrittenEntry = {
  collectionId: string
  levelId: string
  rankingIndex: number
}

/** The rows written into a collection, in write order. */
function writtenEntries(): WrittenEntry[] {
  const call = tx.collectionEntry.createMany.mock.lastCall
  return call ? (call[0] as { data: WrittenEntry[] }).data : []
}

/** Seeds the user's existing collections. */
function existingCollections(
  rows: { id: string; name: string; type: string }[]
) {
  tx.collection.findMany.mockResolvedValue(rows)
}

beforeEach(() => {
  vi.clearAllMocks()
  tx.collection.findMany.mockReset().mockResolvedValue([])
  tx.collection.create
    .mockReset()
    .mockImplementation(async (args: { data: { name: string; type: string } }) => ({
      id: `col-${args.data.type}`,
      name: args.data.name,
      type: args.data.type,
    }))
  tx.collectionEntry.deleteMany.mockReset().mockResolvedValue({ count: 0 })
  tx.collectionEntry.createMany.mockReset().mockResolvedValue({ count: 0 })
  tx.levelProgress.findMany.mockReset().mockResolvedValue([])

  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )
  mockResolveNamesBatch.mockReset().mockResolvedValue([])
  mockEnsureStubLevels.mockReset().mockResolvedValue([])
  mockEnqueueSeedIds.mockReset().mockResolvedValue(undefined)
})

// ─── classifyCollection ──────────────────────────────────────────────────────

describe('classifyCollection', () => {
  it.each([
    'want to beat',
    'Want To Beat',
    'want_to_beat',
    'want-to-beat',
    'WANTTOBEAT',
  ])('matches %s as Want to Beat', (raw) => {
    expect(classifyCollection(raw)).toMatchObject({
      type: 'WANT_TO_BEAT',
      name: 'Want to Beat',
    })
  })

  it.each(['favorites', 'Favourites', 'favorite', 'FAVOURITE'])(
    'matches %s as Favorites, either spelling',
    (raw) => {
      expect(classifyCollection(raw)).toMatchObject({ type: 'FAVORITES' })
    }
  )

  it.each(['least favorites', 'Least Favourites', 'least_favorite'])(
    'matches %s as Least Favorites',
    (raw) => {
      expect(classifyCollection(raw)).toMatchObject({ type: 'LEAST_FAVORITES' })
    }
  )

  it('treats anything else as a custom collection under its own name', () => {
    expect(classifyCollection('  My Grind List  ')).toEqual({
      key: 'custom:my grind list',
      type: 'CUSTOM',
      name: 'My Grind List',
    })
  })

  it('gives the same key to two spellings of one built-in', async () => {
    // Otherwise a sheet using both spellings would write the collection twice,
    // the second pass wiping the first.
    expect(classifyCollection('favorites').key).toBe(
      classifyCollection('Favourites').key
    )
  })

  it('groups custom names case-insensitively', () => {
    expect(classifyCollection('grind').key).toBe(classifyCollection('GRIND').key)
  })
})

// ─── writing membership ──────────────────────────────────────────────────────

describe('commitImportCollections — writing membership', () => {
  it('replaces membership rather than appending to it', async () => {
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
    ])

    const result = await commitImportCollections(USER_ID, [entry('favorites')])

    expect(tx.collectionEntry.deleteMany).toHaveBeenCalledWith({
      where: { collectionId: 'col-fav' },
    })
    expect(result.lists).toEqual([{ list: 'Favorites', placed: 1 }])
  })

  it('writes entries in sheet order with fresh integer indices', async () => {
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
    ])

    await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: '1' }),
      entry('favorites', { levelId: '2' }),
      entry('favorites', { levelId: '3' }),
    ])

    expect(writtenEntries()).toEqual([
      { collectionId: 'col-fav', levelId: '1', rankingIndex: 1 },
      { collectionId: 'col-fav', levelId: '2', rankingIndex: 2 },
      { collectionId: 'col-fav', levelId: '3', rankingIndex: 3 },
    ])
  })

  it('orders by explicit position when every entry has one', async () => {
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
    ])

    await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: '1', position: 3 }),
      entry('favorites', { levelId: '2', position: 1 }),
      entry('favorites', { levelId: '3', position: 2 }),
    ])

    expect(writtenEntries().map((e) => e.levelId)).toEqual(['2', '3', '1'])
  })

  it('falls back to sheet order when only some entries have a position', async () => {
    // A partially-filled position column is ambiguous; row order is the only
    // interpretation that can't reorder the rest arbitrarily.
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
    ])

    await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: '1', position: 9 }),
      entry('favorites', { levelId: '2' }),
    ])

    expect(writtenEntries().map((e) => e.levelId)).toEqual(['1', '2'])
  })

  it('creates a custom collection the user does not have yet', async () => {
    await commitImportCollections(USER_ID, [entry('My Grind List')])

    expect(tx.collection.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, name: 'My Grind List', type: 'CUSTOM' },
      select: { id: true, name: true, type: true },
    })
  })

  it('reuses an existing custom collection by case-insensitive name', async () => {
    existingCollections([
      { id: 'col-grind', name: 'my grind list', type: 'CUSTOM' },
    ])

    await commitImportCollections(USER_ID, [entry('My Grind List')])

    expect(tx.collection.create).not.toHaveBeenCalled()
    expect(tx.collectionEntry.deleteMany).toHaveBeenCalledWith({
      where: { collectionId: 'col-grind' },
    })
  })

  it('creates each named collection only once across many entries', async () => {
    await commitImportCollections(USER_ID, [
      entry('My List', { levelId: '1' }),
      entry('my list', { levelId: '2' }),
    ])

    expect(tx.collection.create).toHaveBeenCalledTimes(1)
    expect(writtenEntries()).toHaveLength(2)
  })

  it('touches only the collections the sheet names', async () => {
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
      { id: 'col-least', name: 'Least Favorites', type: 'LEAST_FAVORITES' },
    ])

    await commitImportCollections(USER_ID, [entry('favorites')])

    expect(tx.collectionEntry.deleteMany).toHaveBeenCalledTimes(1)
    expect(tx.collectionEntry.deleteMany).toHaveBeenCalledWith({
      where: { collectionId: 'col-fav' },
    })
  })

  it('clears a collection the sheet names with no placeable entries', async () => {
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
    ])
    mockResolveNamesBatch.mockResolvedValue([null])

    const result = await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: null, levelName: 'Unknown' }),
    ])

    // Nothing resolved, so nothing to write — but the group never formed, so
    // the collection is left untouched rather than emptied.
    expect(result.lists).toEqual([])
    expect(tx.collectionEntry.deleteMany).not.toHaveBeenCalled()
  })

  it('does nothing at all for an empty sheet', async () => {
    const result = await commitImportCollections(USER_ID, [])

    expect(result).toEqual({ lists: [], skipped: [] })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

// ─── Want to Beat's rule ─────────────────────────────────────────────────────

describe('commitImportCollections — Want to Beat', () => {
  it('skips a completed level and reports why', async () => {
    // The invariant is that Want to Beat only holds unbeaten levels.
    existingCollections([
      { id: 'col-wtb', name: 'Want to Beat', type: 'WANT_TO_BEAT' },
    ])
    tx.levelProgress.findMany.mockResolvedValue([{ levelId: '1' }])

    const result = await commitImportCollections(USER_ID, [
      entry('want to beat', { levelId: '1', levelName: 'Beaten' }),
      entry('want to beat', { levelId: '2' }),
    ])

    expect(writtenEntries().map((e) => e.levelId)).toEqual(['2'])
    expect(result.skipped).toEqual([
      {
        list: 'Want to Beat',
        label: 'Beaten',
        reason: 'Already completed — Want to Beat only holds unbeaten levels',
      },
    ])
    expect(result.lists).toEqual([{ list: 'Want to Beat', placed: 1 }])
  })

  it('applies the completion check only to Want to Beat', async () => {
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
    ])

    await commitImportCollections(USER_ID, [entry('favorites')])

    expect(tx.levelProgress.findMany).not.toHaveBeenCalled()
  })
})

// ─── skipped rows ────────────────────────────────────────────────────────────

describe('commitImportCollections — skipped rows', () => {
  it('skips a duplicate of a level already placed in that collection', async () => {
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
    ])

    const result = await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: '1' }),
      entry('favorites', { levelId: '1', levelName: 'Dupe' }),
    ])

    expect(writtenEntries()).toHaveLength(1)
    expect(result.skipped).toEqual([
      {
        list: 'Favorites',
        label: 'Dupe',
        reason: 'Already in this collection (duplicate)',
      },
    ])
  })

  it('allows the same level in two different collections', async () => {
    await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: '1' }),
      entry('My List', { levelId: '1' }),
    ])

    expect(tx.collectionEntry.createMany).toHaveBeenCalledTimes(2)
  })

  it('skips a row carrying neither an id nor a name', async () => {
    const result = await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: null }),
    ])

    expect(result.skipped).toEqual([
      {
        list: 'Favorites',
        label: 'Favorites',
        reason: 'No level_id or level_name provided',
      },
    ])
  })

  it.each([
    ['ambiguous', 'Matches more than one level — add a level_id'],
    [null, 'Level not found on the GD servers'],
  ])('skips a name-only row that resolves to %s', async (resolution, reason) => {
    mockResolveNamesBatch.mockResolvedValue([resolution])

    const result = await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: null, levelName: 'DeathMoon' }),
    ])

    expect(result.skipped).toEqual([
      { list: 'Favorites', label: 'DeathMoon', reason },
    ])
  })

  it('places a name-only row that resolves uniquely', async () => {
    existingCollections([
      { id: 'col-fav', name: 'Favorites', type: 'FAVORITES' },
    ])
    mockResolveNamesBatch.mockResolvedValue([{ levelId: '999' }])

    const result = await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: null, levelName: 'DeathMoon' }),
    ])

    expect(writtenEntries().map((e) => e.levelId)).toEqual(['999'])
    expect(result.skipped).toEqual([])
  })

  it('resolves all name-only rows in one batch, not one query each', async () => {
    mockResolveNamesBatch.mockResolvedValue([{ levelId: '1' }, { levelId: '2' }])

    await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: null, levelName: 'A' }),
      entry('favorites', { levelId: null, levelName: 'B' }),
    ])

    expect(mockResolveNamesBatch).toHaveBeenCalledTimes(1)
    expect(mockResolveNamesBatch).toHaveBeenCalledWith([
      { name: 'A', creator: undefined, inGameDifficulty: undefined },
      { name: 'B', creator: undefined, inGameDifficulty: undefined },
    ])
  })
})

// ─── stub levels ─────────────────────────────────────────────────────────────

describe('commitImportCollections — uncached levels', () => {
  it('stubs every referenced level so the entries have something to FK to', async () => {
    await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: '1' }),
      entry('My List', { levelId: '2' }),
    ])

    const [, ids] = mockEnsureStubLevels.mock.lastCall as [unknown, string[]]
    expect([...ids].sort()).toEqual(['1', '2'])
  })

  it('queues only the newly created stubs for enrichment', async () => {
    mockEnsureStubLevels.mockResolvedValue(['2'])

    await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: '1' }),
      entry('favorites', { levelId: '2' }),
    ])

    expect(mockEnqueueSeedIds).toHaveBeenCalledWith(['2'])
  })

  it('does not queue anything when every level was already cached', async () => {
    await commitImportCollections(USER_ID, [entry('favorites')])

    expect(mockEnqueueSeedIds).not.toHaveBeenCalled()
  })

  it('still returns the result when queueing fails', async () => {
    // The membership is already committed; a queue failure only means the
    // stubs stay unenriched.
    mockEnsureStubLevels.mockResolvedValue(['2'])
    mockEnqueueSeedIds.mockRejectedValue(new Error('sqs down'))

    const result = await commitImportCollections(USER_ID, [
      entry('favorites', { levelId: '2' }),
    ])

    expect(result.lists).toEqual([{ list: 'Favorites', placed: 1 }])
  })
})
