/**
 * Unit tests for collection entry reordering and removal.
 *
 * Reorder is neighbour-based rather than absolute-position so concurrent drags
 * don't fight over indices, which puts the weight on two things: neighbours
 * must be verified to belong to THIS collection (otherwise a foreign id would
 * bisect against an unrelated index), and once the fractional gap closes the
 * collection is renormalised and the neighbours RE-READ — using the pre-
 * rebalance values would place the entry at a stale index. Prisma is mocked.
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
  reorderEntry,
  removeEntry,
  CollectionError,
  CollectionNotFoundError,
} = await import('./index')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = 'user-1'
const COLLECTION_ID = 'col-1'
const ENTRY_ID = 'entry-moving'

/** The transaction client reorderEntry runs against. */
const tx = {
  collectionEntry: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}

const D = (n: number) => new Prisma.Decimal(n)

/** Stubs the collection as owned by the caller, with the given type. */
function ownedCollection(type: string) {
  prisma.collection.findFirst.mockResolvedValue({
    id: COLLECTION_ID,
    name: 'My List',
    type,
    description: null,
    createdAt: new Date(),
    entries: [],
  } as never)
}

/**
 * Stubs the per-entry index reads. `indices` maps entry id → rankingIndex;
 * an id absent from the map reads as "not in this collection".
 */
function entryIndices(indices: Record<string, Prisma.Decimal>) {
  tx.collectionEntry.findFirst.mockImplementation(
    async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
      const id = args.where.id
      // The entry-exists probe selects only `id`; neighbourIndex selects the
      // rankingIndex.
      if (args.select?.rankingIndex)
        return id in indices ? { rankingIndex: indices[id] } : null
      return id === ENTRY_ID || id in indices ? { id } : null
    }
  )
}

/**
 * The rankingIndex the moved entry ENDS at. Deliberately the LAST write to it:
 * a rebalance renumbers every entry first, including this one, so the first
 * write is the renumber rather than the placement.
 */
function movedTo(): number {
  const calls = tx.collectionEntry.update.mock.calls.filter(
    (c) => (c[0] as { where: { id: string } }).where.id === ENTRY_ID
  )
  const last = calls[calls.length - 1]!
  return Number((last[0] as { data: { rankingIndex: unknown } }).data.rankingIndex)
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.collection.findFirst.mockReset()
  // Both requireCollection and getCollectionDetail read through findFirst with
  // different selects, so one stub has to satisfy both shapes.
  ownedCollection('CUSTOM')
  prisma.levelProgress.findMany.mockReset().mockResolvedValue([] as never)
  prisma.collectionEntry.findFirst.mockReset().mockResolvedValue({ id: ENTRY_ID } as never)
  prisma.collectionEntry.delete.mockReset().mockResolvedValue({} as never)

  tx.collectionEntry.findFirst.mockReset()
  entryIndices({ prev: D(1), next: D(2) })
  tx.collectionEntry.findMany.mockReset().mockResolvedValue([])
  tx.collectionEntry.update.mockReset().mockResolvedValue({})

  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )
})

// ─── guards ──────────────────────────────────────────────────────────────────

describe('reorderEntry — guards', () => {
  it.each(['prevId', 'nextId'])(
    'rejects an entry given as its own %s',
    async (field) => {
      await expect(
        reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { [field]: ENTRY_ID })
      ).rejects.toBeInstanceOf(CollectionError)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    }
  )

  it('reports a self-referential neighbour as 422', async () => {
    await expect(
      reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { prevId: ENTRY_ID })
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects a collection the caller does not own', async () => {
    prisma.collection.findFirst.mockResolvedValue(null)

    await expect(
      reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { prevId: 'prev' })
    ).rejects.toBeInstanceOf(CollectionNotFoundError)
  })

  it('allows reordering a built-in collection', async () => {
    // Only editing/deleting the collection itself is restricted; the user
    // orders their own Favorites.
    ownedCollection('FAVORITES')

    await expect(
      reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { prevId: 'prev' })
    ).resolves.toBeDefined()
  })

  it('rejects an entry that is not in the collection', async () => {
    tx.collectionEntry.findFirst.mockResolvedValue(null)

    await expect(
      reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { prevId: 'prev' })
    ).rejects.toBeInstanceOf(CollectionNotFoundError)
  })

  it('rejects a neighbour belonging to another collection', async () => {
    // Bisecting against a foreign index would place the entry anywhere.
    entryIndices({ prev: D(1) })

    await expect(
      reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { nextId: 'foreign' })
    ).rejects.toThrow(/not an entry of this collection/)
  })
})

// ─── placement ───────────────────────────────────────────────────────────────

describe('reorderEntry — placement', () => {
  it('bisects between two neighbours', async () => {
    entryIndices({ prev: D(1), next: D(2) })

    await reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, {
      prevId: 'prev',
      nextId: 'next',
    })

    expect(movedTo()).toBe(1.5)
  })

  it('appends past the last entry when dropped at the end', async () => {
    entryIndices({ prev: D(5) })

    await reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { prevId: 'prev' })

    expect(movedTo()).toBeGreaterThan(5)
  })

  it('prepends before the first entry when dropped at the top', async () => {
    entryIndices({ next: D(5) })

    await reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { nextId: 'next' })

    expect(movedTo()).toBeLessThan(5)
  })

  it('handles a drop into an otherwise empty collection', async () => {
    entryIndices({})
    tx.collectionEntry.findFirst.mockImplementation(
      async (args: { select?: Record<string, boolean> }) =>
        args.select?.rankingIndex ? null : { id: ENTRY_ID }
    )

    await reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, {})

    expect(movedTo()).toBe(1)
  })
})

// ─── rebalancing ─────────────────────────────────────────────────────────────

describe('reorderEntry — rebalancing', () => {
  /** Neighbours whose gap is under the renormalisation threshold. */
  function tightGap() {
    const calls: Record<string, Prisma.Decimal>[] = [
      { prev: D(1.00001), next: D(1.00002) }, // before rebalance
      { prev: D(1), next: D(2) }, // after rebalance
    ]
    let phase = 0
    tx.collectionEntry.findFirst.mockImplementation(
      async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
        if (!args.select?.rankingIndex) return { id: args.where.id }
        return { rankingIndex: calls[phase]![args.where.id]! }
      }
    )
    // Advance to the post-rebalance indices once rebalance() has run.
    tx.collectionEntry.findMany.mockImplementation(async () => {
      phase = 1
      return [{ id: 'prev' }, { id: ENTRY_ID }, { id: 'next' }]
    })
  }

  it('renormalises to evenly spaced integers when the gap closes', async () => {
    tightGap()

    await reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, {
      prevId: 'prev',
      nextId: 'next',
    })

    const renumbered = tx.collectionEntry.update.mock.calls
      .slice(0, 3)
      .map((c) => Number((c[0] as { data: { rankingIndex: unknown } }).data.rankingIndex))
    expect(renumbered).toEqual([1, 2, 3])
  })

  it('re-reads the neighbours after rebalancing, not before', async () => {
    // Using the pre-rebalance indices would drop the entry at a stale spot.
    tightGap()

    await reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, {
      prevId: 'prev',
      nextId: 'next',
    })

    expect(movedTo()).toBe(1.5)
  })

  it('does not rebalance when the gap is comfortable', async () => {
    entryIndices({ prev: D(1), next: D(2) })

    await reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, {
      prevId: 'prev',
      nextId: 'next',
    })

    expect(tx.collectionEntry.findMany).not.toHaveBeenCalled()
  })

  it('does the whole move in one transaction', async () => {
    await reorderEntry(USER_ID, COLLECTION_ID, ENTRY_ID, { prevId: 'prev' })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

// ─── removeEntry ─────────────────────────────────────────────────────────────

describe('removeEntry', () => {
  it('deletes an entry of a collection the caller owns', async () => {
    await removeEntry(USER_ID, COLLECTION_ID, ENTRY_ID)

    expect(prisma.collectionEntry.delete).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
    })
  })

  it('scopes the lookup to the collection', async () => {
    await removeEntry(USER_ID, COLLECTION_ID, ENTRY_ID)

    expect(prisma.collectionEntry.findFirst).toHaveBeenCalledWith({
      where: { id: ENTRY_ID, collectionId: COLLECTION_ID },
      select: { id: true },
    })
  })

  it('rejects an entry that is not in the collection', async () => {
    prisma.collectionEntry.findFirst.mockResolvedValue(null)

    await expect(
      removeEntry(USER_ID, COLLECTION_ID, ENTRY_ID)
    ).rejects.toBeInstanceOf(CollectionNotFoundError)
    expect(prisma.collectionEntry.delete).not.toHaveBeenCalled()
  })

  it('rejects a collection the caller does not own', async () => {
    prisma.collection.findFirst.mockResolvedValue(null)

    await expect(
      removeEntry(USER_ID, COLLECTION_ID, ENTRY_ID)
    ).rejects.toBeInstanceOf(CollectionNotFoundError)
    expect(prisma.collectionEntry.delete).not.toHaveBeenCalled()
  })

  it('allows removal from a built-in collection', async () => {
    ownedCollection('WANT_TO_BEAT')

    await expect(
      removeEntry(USER_ID, COLLECTION_ID, ENTRY_ID)
    ).resolves.toBeDefined()
  })
})
