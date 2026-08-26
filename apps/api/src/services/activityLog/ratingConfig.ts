// Diffing one save of the weighted-rating configuration into field-change rows.
//
// RATING_CONFIG_CHANGE reuses activity_log_field_change rather than adding a
// JSON column to activity_log, because the save is already a diff of named
// things and the table already stores "this field went from X to Y". The one
// place the fit is loose is the category list, which is a set rather than a
// scalar — so it travels as a single serialized row rather than one row per
// category. Categories are added, removed, renamed and reweighted in the same
// save, and a per-category row set would have to invent a stable identity for a
// category that has none yet (creates get their ids inside the transaction).
//
// What is deliberately NOT computed here: the knock-on effect a weight change
// has on every level's weighted total and rank position. Weighted averages are
// computed at query time (see docs/RATING_SYSTEM.md), and logging the movement
// would fill a feed with hundreds of "changes" the user did not make.

import { ActivityFieldCategory, type RatingMode } from '@prisma/client'
import type { FieldChange } from './fieldScope'
import { serializeFieldValue } from './fieldScope'

/** One category's contribution to the config, as the diff compares it. */
export interface RatingConfigCategoryState {
  name: string
  /** Normalized weight in [0, 1]; a Prisma `Decimal` read back is fine. */
  weight: number | { toNumber(): number }
  sortOrder: number
}

/** The whole weighted-rating configuration at one point in time. */
export interface RatingConfigState {
  categories: RatingConfigCategoryState[]
  includeEnjoyment: boolean
  enjoymentWeight: number | { toNumber(): number }
  enjoymentSortOrder: number
}

function toNumber(value: number | { toNumber(): number }): number {
  return typeof value === 'number' ? value : value.toNumber()
}

// The category set as one comparable string: name, weight and position, in
// priority order. Ordered by sortOrder rather than by the array it arrived in,
// so a reordering shows up as a change and an incidental array order does not.
function serializeCategories(categories: RatingConfigCategoryState[]): string {
  return JSON.stringify(
    [...categories]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        name: c.name,
        weight: toNumber(c.weight),
        sortOrder: c.sortOrder,
      }))
  )
}

function scalarChange(
  fieldName: string,
  before: unknown,
  after: unknown
): FieldChange | null {
  const oldValue = serializeFieldValue(before)
  const newValue = serializeFieldValue(after)
  if (oldValue === newValue) return null
  return {
    fieldName,
    category: ActivityFieldCategory.RATING_CONFIG,
    oldValue,
    newValue,
  }
}

/**
 * Diffs a rating-config save into the field-change rows its event carries.
 *
 * `rating_categories` is one row holding the whole before/after category list
 * as JSON (name, weight, sortOrder) — see the module header for why it is not
 * one row per category. The enjoyment settings are ordinary scalar rows.
 *
 * @returns One row per aspect that changed. **Empty means the save was a no-op**
 * and the caller should emit no event at all: an event with no field changes
 * says nothing a feed could render.
 */
export function buildRatingConfigChanges(
  before: RatingConfigState,
  after: RatingConfigState
): FieldChange[] {
  const changes: FieldChange[] = []

  const beforeCategories = serializeCategories(before.categories)
  const afterCategories = serializeCategories(after.categories)
  if (beforeCategories !== afterCategories) {
    changes.push({
      fieldName: 'rating_categories',
      category: ActivityFieldCategory.RATING_CONFIG,
      oldValue: beforeCategories,
      newValue: afterCategories,
    })
  }

  const scalars: Array<[string, unknown, unknown]> = [
    ['include_enjoyment', before.includeEnjoyment, after.includeEnjoyment],
    [
      'enjoyment_weight',
      toNumber(before.enjoymentWeight),
      toNumber(after.enjoymentWeight),
    ],
    [
      'enjoyment_sort_order',
      before.enjoymentSortOrder,
      after.enjoymentSortOrder,
    ],
  ]
  for (const [fieldName, oldValue, newValue] of scalars) {
    const change = scalarChange(fieldName, oldValue, newValue)
    if (change) changes.push(change)
  }

  return changes
}

/**
 * The field-change row for a SIMPLE ↔ WEIGHTED mode switch.
 *
 * Separate from {@link buildRatingConfigChanges} because the mode is not part of
 * the rating-config payload — `User.ratingMode` is written by
 * `PATCH /v1/me` alongside every other preference, so that route emits its own
 * RATING_CONFIG_CHANGE when (and only when) the mode actually moves.
 *
 * @returns A single-element array, or an empty one when the mode is unchanged —
 * in which case the caller emits nothing.
 */
export function buildRatingModeChange(
  before: RatingMode,
  after: RatingMode
): FieldChange[] {
  const change = scalarChange('rating_mode', before, after)
  return change ? [change] : []
}
