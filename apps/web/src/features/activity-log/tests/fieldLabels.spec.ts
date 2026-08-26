/**
 * Rendering one field-change row.
 *
 * Two things here are easy to get wrong and invisible once rendered. Ratings
 * are stored as integers 0–100 whatever the user's display scale is, so a row
 * that skipped the conversion would show "82" to someone who set their scale to
 * 0–10 and looks entirely plausible. And per-category scores are keyed by
 * category ID, not by the name the category had at edit time — resolving one
 * that has since been deleted against the current list would otherwise attach
 * whatever name now sits in that position.
 */

import { describe, expect, it } from 'vitest'
import type { RatingCategory } from '@/lib/api/me'
import {
  configSummary,
  fieldLabel,
  fieldValue,
  parseConfigCategories,
} from '../fieldLabels'

const categories: RatingCategory[] = [
  { id: 'cat-1', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
  { id: 'cat-2', name: 'Decoration', weight: 0.5, sortOrder: 1 },
]

const tenScale = { scale: 'ZERO_TO_TEN' as const, datePref: 'ISO' as const }
const hundredScale = {
  scale: 'ZERO_TO_HUNDRED' as const,
  datePref: 'ISO' as const,
}

describe('fieldLabel', () => {
  it('resolves a per-category score against the id, not the position', () => {
    expect(fieldLabel('rating_score:cat-2', categories)).toBe('Decoration')
  })

  it('renders a category that no longer exists as removed, not as a wrong name', () => {
    expect(fieldLabel('rating_score:gone', categories)).toBe('Removed category')
  })

  it('falls back to the field name itself for a field with no label yet', () => {
    expect(fieldLabel('some_new_field', categories)).toBe('some new field')
  })
})

describe('fieldValue', () => {
  it('converts a stored rating into the viewer’s display scale', () => {
    expect(fieldValue('simple_rating', '82', tenScale)).toBe('8.2')
    expect(fieldValue('simple_rating', '82', hundredScale)).toBe('82')
  })

  it('converts a per-category score too', () => {
    expect(fieldValue('rating_score:cat-1', '91', tenScale)).toBe('9.1')
  })

  it('converts the derived weighted average, keeping its precision', () => {
    expect(fieldValue('weighted_average', '83.1', tenScale)).toBe('8.31')
  })

  it('leaves the rating rank as a position, not a score', () => {
    // It is a place in an order, not a value on the rating scale.
    expect(fieldValue('rating_rank', '18', tenScale)).toBe('#18')
  })

  it('renders a cleared value as absent rather than as the word null', () => {
    expect(fieldValue('notes', null, tenScale)).toBeNull()
  })

  it('reads booleans as yes and no', () => {
    expect(fieldValue('on_stream', 'true', tenScale)).toBe('Yes')
    expect(fieldValue('on_stream', 'false', tenScale)).toBe('No')
  })
})

describe('parseConfigCategories', () => {
  it('returns the list in priority order regardless of how it was stored', () => {
    const parsed = parseConfigCategories(
      JSON.stringify([
        { name: 'Decoration', weight: 0.2, sortOrder: 2 },
        { name: 'Gameplay', weight: 0.8, sortOrder: 1 },
      ])
    )
    expect(parsed?.map((c) => c.name)).toEqual(['Gameplay', 'Decoration'])
  })

  it('survives a value it cannot read rather than throwing the feed away', () => {
    expect(parseConfigCategories('not json')).toBeNull()
    expect(parseConfigCategories(null)).toBeNull()
  })
})

describe('configSummary', () => {
  it('leads with the mode switch, which is the consequential change', () => {
    expect(
      configSummary([
        {
          fieldName: 'rating_mode',
          category: 'RATING_CONFIG',
          oldValue: 'SIMPLE',
          newValue: 'WEIGHTED',
        },
        {
          fieldName: 'rating_categories',
          category: 'RATING_CONFIG',
          oldValue: '[]',
          newValue: JSON.stringify([
            { name: 'A', weight: 0.5, sortOrder: 0 },
            { name: 'B', weight: 0.5, sortOrder: 1 },
          ]),
        },
      ])
    ).toBe('Switched to weighted ratings — 2 categories')
  })

  it('counts the settings when no mode switch was involved', () => {
    expect(
      configSummary([
        {
          fieldName: 'include_enjoyment',
          category: 'RATING_CONFIG',
          oldValue: 'false',
          newValue: 'true',
        },
      ])
    ).toBe('1 setting changed')
  })
})
