/**
 * Unit tests for the two derived RATING rows a LOG_EDIT carries.
 *
 * The rule with teeth is the tie-break chain: rating, then enjoyment, then the
 * representative update's date, then levelId. Every link matters, because
 * `rating_rank` is the one figure in the whole log that cannot be recomputed
 * afterwards — an order that is not total would make it depend on the row order
 * Postgres happened to return.
 *
 * The other is that the two rows are diffed independently. An enjoyment change
 * under `includeEnjoyment: false` moves the tie-break without moving the
 * average, and must still produce a rank row.
 */

import { describe, expect, it } from 'vitest'
import {
  buildRatingStandingChanges,
  readRatingStandings,
  type RatingStandings,
} from './ratingStanding'

type Level = {
  levelId: string
  simpleRating?: number | null
  scores?: { categoryId: string; score: number }[]
  enjoyment?: number | null
  date?: Date | null
}

type Config = {
  ratingMode?: 'SIMPLE' | 'WEIGHTED'
  includeEnjoyment?: boolean
  enjoymentWeight?: number
  categories?: { id: string; weight: number }[]
}

// A stand-in transaction client. readRatingStandings takes its client as a
// parameter, so the two reads it makes can be answered directly rather than by
// mocking the prisma module.
function fakeTx(levels: Level[], config: Config = {}) {
  return {
    user: {
      findUniqueOrThrow: async () => ({
        ratingMode: config.ratingMode ?? 'SIMPLE',
        includeEnjoyment: config.includeEnjoyment ?? false,
        enjoymentWeight: config.enjoymentWeight ?? 0.5,
        ratingCategories: config.categories ?? [],
      }),
    },
    levelProgress: {
      findMany: async () =>
        levels.map((l) => ({
          levelId: l.levelId,
          simpleRating: l.simpleRating ?? null,
          ratingScores: l.scores ?? [],
          progressUpdates:
            l.enjoyment === undefined && l.date === undefined
              ? []
              : [{ enjoyment: l.enjoyment ?? null, date: l.date ?? null }],
        })),
    },
  } as unknown as Parameters<typeof readRatingStandings>[0]
}

const ranks = (standings: RatingStandings) =>
  Object.fromEntries([...standings].map(([id, s]) => [id, s.rank]))

describe('readRatingStandings', () => {
  it('ranks the user’s levels 1-based by overall rating, highest first', async () => {
    const standings = await readRatingStandings(
      fakeTx([
        { levelId: '1', simpleRating: 40 },
        { levelId: '2', simpleRating: 90 },
        { levelId: '3', simpleRating: 70 },
      ]),
      'u1'
    )
    expect(ranks(standings)).toEqual({ '2': 1, '3': 2, '1': 3 })
  })

  it('gives an unrated level no rank and lets it take no position', async () => {
    // An unrated level holds no place in a rating order, so the level below it
    // must not be pushed down by one.
    const standings = await readRatingStandings(
      fakeTx([
        { levelId: '1', simpleRating: 90 },
        { levelId: '2', simpleRating: null },
        { levelId: '3', simpleRating: 50 },
      ]),
      'u1'
    )
    expect(standings.get('2')).toEqual({ overallRating: null, rank: null })
    expect(ranks(standings)).toEqual({ '1': 1, '3': 2, '2': null })
  })

  it('breaks a rating tie on enjoyment, higher first', async () => {
    const standings = await readRatingStandings(
      fakeTx([
        { levelId: '1', simpleRating: 80, enjoyment: 20 },
        { levelId: '2', simpleRating: 80, enjoyment: 90 },
      ]),
      'u1'
    )
    expect(ranks(standings)).toEqual({ '2': 1, '1': 2 })
  })

  it('breaks an enjoyment tie on the earlier date, then on levelId', async () => {
    const standings = await readRatingStandings(
      fakeTx([
        { levelId: '30', simpleRating: 80, date: new Date('2026-03-01') },
        { levelId: '10', simpleRating: 80, date: new Date('2026-01-01') },
        { levelId: '20', simpleRating: 80, date: new Date('2026-01-01') },
      ]),
      'u1'
    )
    expect(ranks(standings)).toEqual({ '10': 1, '20': 2, '30': 3 })
  })

  it('sorts a missing tie-break value last rather than first', async () => {
    const standings = await readRatingStandings(
      fakeTx([
        { levelId: '1', simpleRating: 80, enjoyment: null },
        { levelId: '2', simpleRating: 80, enjoyment: 10 },
      ]),
      'u1'
    )
    expect(ranks(standings)).toEqual({ '2': 1, '1': 2 })
  })

  it('computes the weighted average in WEIGHTED mode', async () => {
    const standings = await readRatingStandings(
      fakeTx(
        [
          {
            levelId: '1',
            scores: [
              { categoryId: 'a', score: 60 },
              { categoryId: 'b', score: 100 },
            ],
          },
        ],
        {
          ratingMode: 'WEIGHTED',
          categories: [
            { id: 'a', weight: 0.75 },
            { id: 'b', weight: 0.25 },
          ],
        }
      ),
      'u1'
    )
    expect(standings.get('1')?.overallRating).toBe(70)
  })
})

describe('buildRatingStandingChanges', () => {
  const standings = (
    entries: Record<
      string,
      { overallRating: number | null; rank: number | null }
    >
  ): RatingStandings => new Map(Object.entries(entries))

  it('records both figures when a rating save moves them', () => {
    expect(
      buildRatingStandingChanges(
        '1',
        standings({ '1': { overallRating: 40, rank: 3 } }),
        standings({ '1': { overallRating: 90, rank: 1 } })
      )
    ).toEqual([
      {
        fieldName: 'weighted_average',
        category: 'RATING',
        oldValue: '40',
        newValue: '90',
      },
      {
        fieldName: 'rating_rank',
        category: 'RATING',
        oldValue: '3',
        newValue: '1',
      },
    ])
  })

  it('records the rank alone when only the tie-break moved', () => {
    // Enjoyment changed with includeEnjoyment off: the average is untouched,
    // the order is not.
    const changes = buildRatingStandingChanges(
      '1',
      standings({ '1': { overallRating: 80, rank: 4 } }),
      standings({ '1': { overallRating: 80, rank: 2 } })
    )
    expect(changes.map((c) => c.fieldName)).toEqual(['rating_rank'])
  })

  it('records nothing when the save left the rating order alone', () => {
    expect(
      buildRatingStandingChanges(
        '1',
        standings({ '1': { overallRating: 80, rank: 2 } }),
        standings({ '1': { overallRating: 80, rank: 2 } })
      )
    ).toEqual([])
  })

  it('records the first rating a level was ever given as null → value', () => {
    const changes = buildRatingStandingChanges(
      '1',
      standings({ '1': { overallRating: null, rank: null } }),
      standings({ '1': { overallRating: 75, rank: 1 } })
    )
    expect(changes).toEqual([
      {
        fieldName: 'weighted_average',
        category: 'RATING',
        oldValue: null,
        newValue: '75',
      },
      {
        fieldName: 'rating_rank',
        category: 'RATING',
        oldValue: null,
        newValue: '1',
      },
    ])
  })
})
