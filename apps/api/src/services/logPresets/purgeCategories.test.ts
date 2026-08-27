/**
 * Unit tests for purging deleted rating categories out of a preset's opaque
 * view-config blobs. The point of the module is that it edits JSON the rest of
 * the API never inspects, so what's worth pinning is the two encodings it has
 * to know about (`cat:<id>` for sorts/columns, a bare id for categoryRatings),
 * that it returns null when there's nothing to write, and that it never
 * reshapes a blob it doesn't recognize.
 */

import { describe, expect, it } from 'vitest'
import { purgeCategoriesFromPreset } from './index'

const KEPT = 'kept-category-id'
const GONE = 'gone-category-id'

/** A preset referencing both categories in all four fields. */
function preset() {
  return {
    sorts: [
      { key: `cat:${GONE}`, dir: 'desc' },
      { key: `cat:${KEPT}`, dir: 'asc' },
      { key: 'date', dir: 'desc' },
    ],
    filters: {
      statuses: ['COMPLETED'],
      categoryRatings: { [KEPT]: [0, 100], [GONE]: [40, 90] },
    },
    columns: { date: true, [`cat:${KEPT}`]: true, [`cat:${GONE}`]: false },
    columnOrder: ['date', `cat:${GONE}`, `cat:${KEPT}`],
  }
}

describe('purgeCategoriesFromPreset', () => {
  it('strips the deleted category from all four view fields', () => {
    const result = purgeCategoriesFromPreset(preset(), new Set([GONE]))

    expect(result).toEqual({
      sorts: [
        { key: `cat:${KEPT}`, dir: 'asc' },
        { key: 'date', dir: 'desc' },
      ],
      filters: {
        statuses: ['COMPLETED'],
        categoryRatings: { [KEPT]: [0, 100] },
      },
      columns: { date: true, [`cat:${KEPT}`]: true },
      columnOrder: ['date', `cat:${KEPT}`],
    })
  })

  it('returns null when the preset referenced nothing that was deleted', () => {
    expect(
      purgeCategoriesFromPreset(preset(), new Set(['some-other-id']))
    ).toBeNull()
  })

  it('returns null when no categories were deleted', () => {
    expect(purgeCategoriesFromPreset(preset(), new Set())).toBeNull()
  })

  it('does not confuse a bare id with a cat: key', () => {
    // categoryRatings is keyed by the bare id; sorts/columns/columnOrder are
    // not. Neither encoding may leak into the other.
    const result = purgeCategoriesFromPreset(
      {
        sorts: [{ key: GONE, dir: 'desc' }],
        filters: { categoryRatings: { [`cat:${GONE}`]: [0, 50] } },
        columns: { [GONE]: true },
        columnOrder: [GONE],
      },
      new Set([GONE])
    )

    expect(result).toBeNull()
  })

  it('leaves unrecognized blob shapes exactly as stored', () => {
    const result = purgeCategoriesFromPreset(
      {
        sorts: 'not-an-array',
        filters: { categoryRatings: [GONE] },
        columns: null,
        columnOrder: { [`cat:${GONE}`]: true },
      },
      new Set([GONE])
    )

    expect(result).toBeNull()
  })

  it('purges several categories at once', () => {
    const other = 'other-gone-id'
    const result = purgeCategoriesFromPreset(
      {
        sorts: [{ key: `cat:${other}`, dir: 'asc' }],
        filters: { categoryRatings: { [GONE]: [0, 10] } },
        columns: { [`cat:${GONE}`]: true, [`cat:${other}`]: true },
        columnOrder: [`cat:${GONE}`, `cat:${other}`, 'date'],
      },
      new Set([GONE, other])
    )

    expect(result).toEqual({
      sorts: [],
      filters: { categoryRatings: {} },
      columns: {},
      columnOrder: ['date'],
    })
  })
})
