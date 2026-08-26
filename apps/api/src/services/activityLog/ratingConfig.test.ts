/**
 * Unit tests for the rating-config diff.
 *
 * The rule that matters most is the empty result: a save that changed nothing
 * must produce no rows, because the caller reads that as "emit no event" and an
 * event with no field changes is a feed entry with nothing to say. The other is
 * that the category list is compared in priority order, not in whatever order
 * the request array happened to arrive in.
 */

import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  buildRatingConfigChanges,
  buildRatingModeChange,
  type RatingConfigState,
} from './ratingConfig'

const state = (overrides: Partial<RatingConfigState> = {}): RatingConfigState =>
  ({
    categories: [
      { name: 'Gameplay', weight: 0.5, sortOrder: 0 },
      { name: 'Decoration', weight: 0.5, sortOrder: 1 },
    ],
    includeEnjoyment: false,
    enjoymentWeight: 0,
    enjoymentSortOrder: 99,
    ...overrides,
  }) satisfies RatingConfigState

/** The changed field names, so assertions don't restate the JSON payloads. */
const names = (changes: { fieldName: string }[]) =>
  changes.map((c) => c.fieldName).sort()

describe('buildRatingConfigChanges', () => {
  it('produces nothing for a save that changed nothing', () => {
    expect(buildRatingConfigChanges(state(), state())).toEqual([])
  })

  it('records a renamed category in the category list row', () => {
    const changes = buildRatingConfigChanges(
      state(),
      state({
        categories: [
          { name: 'Gameplay', weight: 0.5, sortOrder: 0 },
          { name: 'Visuals', weight: 0.5, sortOrder: 1 },
        ],
      })
    )

    expect(names(changes)).toEqual(['rating_categories'])
    expect(changes[0]?.oldValue).toContain('Decoration')
    expect(changes[0]?.newValue).toContain('Visuals')
  })

  it('records a reweighting', () => {
    const changes = buildRatingConfigChanges(
      state(),
      state({
        categories: [
          { name: 'Gameplay', weight: 0.7, sortOrder: 0 },
          { name: 'Decoration', weight: 0.3, sortOrder: 1 },
        ],
      })
    )

    expect(names(changes)).toEqual(['rating_categories'])
  })

  it('records an added and a removed category alike', () => {
    const added = buildRatingConfigChanges(
      state(),
      state({
        categories: [
          { name: 'Gameplay', weight: 0.4, sortOrder: 0 },
          { name: 'Decoration', weight: 0.3, sortOrder: 1 },
          { name: 'Song', weight: 0.3, sortOrder: 2 },
        ],
      })
    )
    expect(added[0]?.newValue).toContain('Song')

    const removed = buildRatingConfigChanges(
      state(),
      state({ categories: [{ name: 'Gameplay', weight: 1, sortOrder: 0 }] })
    )
    expect(removed[0]?.oldValue).toContain('Decoration')
    expect(removed[0]?.newValue).not.toContain('Decoration')
  })

  it('ignores the order the categories arrived in, comparing by sortOrder', () => {
    const shuffled = buildRatingConfigChanges(
      state(),
      state({
        categories: [
          { name: 'Decoration', weight: 0.5, sortOrder: 1 },
          { name: 'Gameplay', weight: 0.5, sortOrder: 0 },
        ],
      })
    )

    expect(shuffled).toEqual([])
  })

  it('records a genuine reordering, which is a change of priority', () => {
    const changes = buildRatingConfigChanges(
      state(),
      state({
        categories: [
          { name: 'Decoration', weight: 0.5, sortOrder: 0 },
          { name: 'Gameplay', weight: 0.5, sortOrder: 1 },
        ],
      })
    )

    expect(names(changes)).toEqual(['rating_categories'])
  })

  it('records the enjoyment settings as their own scalar rows', () => {
    const changes = buildRatingConfigChanges(
      state(),
      state({
        includeEnjoyment: true,
        enjoymentWeight: 0.2,
        enjoymentSortOrder: 1,
      })
    )

    expect(names(changes)).toEqual([
      'enjoyment_sort_order',
      'enjoyment_weight',
      'include_enjoyment',
    ])
  })

  it('compares Decimal weights read back from the database by value', () => {
    // The "before" side comes from Prisma, the "after" side from the request.
    const before = state({
      categories: [
        { name: 'Gameplay', weight: new Prisma.Decimal('0.50'), sortOrder: 0 },
        {
          name: 'Decoration',
          weight: new Prisma.Decimal('0.50'),
          sortOrder: 1,
        },
      ],
      enjoymentWeight: new Prisma.Decimal('0.00'),
    })

    expect(buildRatingConfigChanges(before, state())).toEqual([])
  })
})

describe('buildRatingModeChange', () => {
  it('records a mode switch', () => {
    expect(buildRatingModeChange('SIMPLE', 'WEIGHTED')).toEqual([
      {
        fieldName: 'rating_mode',
        category: 'RATING_CONFIG',
        oldValue: 'SIMPLE',
        newValue: 'WEIGHTED',
      },
    ])
  })

  it('produces nothing when the mode is re-sent unchanged', () => {
    expect(buildRatingModeChange('WEIGHTED', 'WEIGHTED')).toEqual([])
  })
})
