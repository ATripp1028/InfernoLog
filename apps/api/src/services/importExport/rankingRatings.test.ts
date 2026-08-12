/**
 * Unit tests for the Ranking and Ratings tab imports.
 *
 * Both attach only to COMPLETED levels and both report an unattachable row as
 * `skipped` rather than failing the import — which makes every skip rule a
 * silent failure mode if it regresses. The one with real blast radius is
 * ranking's "don't replace when nothing resolved": a full replace of a tab that
 * resolved to nothing would wipe an existing ranking outright. Prisma is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { ImportRankingEntry, ImportRatingEntry } from '@infernolog/core'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { commitImportRanking } = await import('./ranking')
const { commitImportRatings } = await import('./ratings')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const USER_ID = 'user-1'

/** The transaction client both commits run against. */
const tx = {
  classicRanking: { deleteMany: vi.fn(), createMany: vi.fn() },
  ratingCategory: { createMany: vi.fn() },
  ratingScore: { deleteMany: vi.fn(), createMany: vi.fn() },
}

/** Seeds the user's completed levels (the only valid targets for both tabs). */
function completed(rows: { lpId: string; levelId: string; name: string | null }[]) {
  prisma.levelProgress.findMany.mockResolvedValue(
    rows.map((r) => ({
      id: r.lpId,
      levelId: r.levelId,
      level: { name: r.name },
    })) as never
  )
}

/** The levelProgressIds written to the ranking, hardest first. */
function rankedLpIds(): string[] {
  const call = tx.classicRanking.createMany.mock.lastCall
  return call
    ? (call[0] as { data: { levelProgressId: string }[] }).data.map(
        (d) => d.levelProgressId
      )
    : []
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.levelProgress.findMany.mockReset().mockResolvedValue([] as never)
  prisma.ratingCategory.findMany.mockReset().mockResolvedValue([] as never)
  for (const model of Object.values(tx))
    for (const fn of Object.values(model)) fn.mockReset().mockResolvedValue({})
  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )
})

// ─── ranking ─────────────────────────────────────────────────────────────────

describe('commitImportRanking', () => {
  const entry = (e: Partial<ImportRankingEntry>) => e as ImportRankingEntry

  it('replaces the ranking with the sheet order, hardest first', async () => {
    completed([
      { lpId: 'lp-1', levelId: '1', name: 'A' },
      { lpId: 'lp-2', levelId: '2', name: 'B' },
    ])

    const result = await commitImportRanking(USER_ID, [
      entry({ levelId: '2' }),
      entry({ levelId: '1' }),
    ])

    expect(tx.classicRanking.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    })
    expect(rankedLpIds()).toEqual(['lp-2', 'lp-1'])
    expect(result.placed).toBe(2)
  })

  it('gives the hardest entry the highest index', async () => {
    completed([
      { lpId: 'lp-1', levelId: '1', name: 'A' },
      { lpId: 'lp-2', levelId: '2', name: 'B' },
    ])

    await commitImportRanking(USER_ID, [
      entry({ levelId: '1' }),
      entry({ levelId: '2' }),
    ])

    const { data } = tx.classicRanking.createMany.mock.lastCall![0] as {
      data: { rankingIndex: unknown }[]
    }
    expect(data.map((d) => Number(d.rankingIndex))).toEqual([2, 1])
  })

  it('resolves a name-only row against the completed levels', async () => {
    completed([{ lpId: 'lp-1', levelId: '1', name: 'DeathMoon' }])

    const result = await commitImportRanking(USER_ID, [
      entry({ levelName: '  deathmoon ' }),
    ])

    expect(rankedLpIds()).toEqual(['lp-1'])
    expect(result.skipped).toEqual([])
  })

  it('skips a name matching more than one completion', async () => {
    completed([
      { lpId: 'lp-1', levelId: '1', name: 'DeathMoon' },
      { lpId: 'lp-2', levelId: '2', name: 'DeathMoon' },
    ])

    const result = await commitImportRanking(USER_ID, [
      entry({ levelName: 'DeathMoon' }),
    ])

    expect(result.placed).toBe(0)
    expect(result.skipped[0]!.reason).toContain('more than one')
  })

  it('skips a level the user has not completed', async () => {
    // Rank only applies to completions.
    const result = await commitImportRanking(USER_ID, [entry({ levelId: '9' })])

    expect(result.skipped[0]!.reason).toContain('Not among your completed')
  })

  it('skips a level ranked twice, keeping the higher placement', async () => {
    completed([{ lpId: 'lp-1', levelId: '1', name: 'A' }])

    const result = await commitImportRanking(USER_ID, [
      entry({ levelId: '1' }),
      entry({ levelId: '1' }),
    ])

    expect(rankedLpIds()).toEqual(['lp-1'])
    expect(result.skipped[0]!.reason).toContain('already ranked higher')
  })

  it('labels an unresolvable row by rank when it has no name or id', async () => {
    const result = await commitImportRanking(USER_ID, [entry({})])

    expect(result.skipped[0]!.label).toBe('rank 1')
  })

  it('does NOT wipe the existing ranking when nothing resolved', async () => {
    // A replace on an all-unresolvable tab would destroy the user's ranking.
    const result = await commitImportRanking(USER_ID, [
      entry({ levelId: '9' }),
      entry({ levelName: 'Unknown' }),
    ])

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(tx.classicRanking.deleteMany).not.toHaveBeenCalled()
    expect(result.placed).toBe(0)
    expect(result.skipped).toHaveLength(2)
  })

  it('ignores a completed level whose name is blank when matching by name', async () => {
    completed([{ lpId: 'lp-1', levelId: '1', name: '   ' }])

    const result = await commitImportRanking(USER_ID, [
      entry({ levelName: 'Anything' }),
    ])

    expect(result.placed).toBe(0)
  })
})

// ─── ratings ─────────────────────────────────────────────────────────────────

describe('commitImportRatings', () => {
  const entry = (e: Partial<ImportRatingEntry>) => e as ImportRatingEntry

  it('scores a completed level against an existing category', async () => {
    completed([{ lpId: 'lp-1', levelId: '1', name: 'A' }])
    prisma.ratingCategory.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Gameplay', sortOrder: 0 },
    ] as never)

    const result = await commitImportRatings(USER_ID, [
      entry({ levelId: '1', scores: { Gameplay: 85 } }),
    ])

    expect(result.scored).toBe(1)
    expect(result.levels).toBe(1)
    expect(tx.ratingCategory.createMany).not.toHaveBeenCalled()
  })

  it('creates a category the user does not have yet', async () => {
    completed([{ lpId: 'lp-1', levelId: '1', name: 'A' }])

    const result = await commitImportRatings(USER_ID, [
      entry({ levelId: '1', scores: { Vibes: 70 } }),
    ])

    expect(tx.ratingCategory.createMany).toHaveBeenCalled()
    expect(result.categoriesCreated).toContain('Vibes')
  })

  it('matches an existing category case-insensitively', async () => {
    completed([{ lpId: 'lp-1', levelId: '1', name: 'A' }])
    prisma.ratingCategory.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Gameplay', sortOrder: 0 },
    ] as never)

    const result = await commitImportRatings(USER_ID, [
      entry({ levelId: '1', scores: { gameplay: 85 } }),
    ])

    expect(result.categoriesCreated).toEqual([])
  })

  it('resolves a name-only row against the completed levels', async () => {
    completed([{ lpId: 'lp-1', levelId: '1', name: 'DeathMoon' }])

    const result = await commitImportRatings(USER_ID, [
      entry({ levelName: 'deathmoon', scores: { Gameplay: 85 } }),
    ])

    expect(result.scored).toBe(1)
  })

  it('skips a name matching more than one completion', async () => {
    completed([
      { lpId: 'lp-1', levelId: '1', name: 'DeathMoon' },
      { lpId: 'lp-2', levelId: '2', name: 'DeathMoon' },
    ])

    const result = await commitImportRatings(USER_ID, [
      entry({ levelName: 'DeathMoon', scores: { Gameplay: 85 } }),
    ])

    expect(result.scored).toBe(0)
    expect(result.skipped[0]!.reason).toContain('more than one')
  })

  it('skips a level the user has not completed', async () => {
    const result = await commitImportRatings(USER_ID, [
      entry({ levelId: '9', scores: { Gameplay: 85 } }),
    ])

    expect(result.skipped[0]!.reason).toContain('completions')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('labels a row with neither name nor id as "row"', async () => {
    const result = await commitImportRatings(USER_ID, [
      entry({ scores: { Gameplay: 85 } }),
    ])

    expect(result.skipped[0]!.label).toBe('row')
  })

  it('ignores a blank category name', async () => {
    completed([{ lpId: 'lp-1', levelId: '1', name: 'A' }])

    const result = await commitImportRatings(USER_ID, [
      entry({ levelId: '1', scores: { '   ': 85, Gameplay: 70 } }),
    ])

    expect(result.scored).toBe(1)
    expect(result.categoriesCreated).toEqual(['Gameplay'])
  })

  it('counts distinct levels separately from scores', async () => {
    completed([
      { lpId: 'lp-1', levelId: '1', name: 'A' },
      { lpId: 'lp-2', levelId: '2', name: 'B' },
    ])

    const result = await commitImportRatings(USER_ID, [
      entry({ levelId: '1', scores: { Gameplay: 85, Deco: 70 } }),
      entry({ levelId: '2', scores: { Gameplay: 60 } }),
    ])

    expect(result.scored).toBe(3)
    expect(result.levels).toBe(2)
  })

  it('writes nothing when no row resolved', async () => {
    const result = await commitImportRatings(USER_ID, [
      entry({ levelId: '9', scores: { Gameplay: 85 } }),
    ])

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(result).toMatchObject({ scored: 0, levels: 0, categoriesCreated: [] })
  })
})
