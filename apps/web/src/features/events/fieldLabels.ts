// Turning a raw field-change row into something a person can read.
//
// `fieldName` is a snake_case column identifier — it is for display and for
// reading one field's history, never for filtering (that is what `category` is
// for). The table below is the display half of the scope table in
// apps/api/src/services/activityLog/fieldScope.ts; a field added there needs a
// line here too, and falls back to a de-underscored version of its own name
// until it gets one.

import type { ActivityFieldChange } from '@infernolog/core'
import type { RatingCategory } from '@/lib/api/me'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import { formatDate } from '@/lib/dateFormat'
import { formatRating } from '@/lib/ratingScale'
import { formatNumber } from '@/features/logging/format'
import { opinionLabel } from '@/lib/difficultyOpinionLabel'

const FIELD_LABELS: Record<string, string> = {
  // Rating
  simple_rating: 'Rating',
  enjoyment: 'Enjoyment',
  weighted_average: 'Weighted average',
  rating_rank: 'Ranking',
  // Session detail
  percentage: 'Percentage',
  run_from: 'Run from',
  run_to: 'Run to',
  attempts: 'Attempts',
  date: 'Date',
  date_timezone: 'Time zone',
  date_uncertain: 'Date is approximate',
  fps: 'FPS',
  percentage_version: 'Percentage system',
  on_stream: 'On stream',
  device: 'Device',
  notes: 'Notes',
  two_player_solo: 'Beat solo',
  two_player_partner: 'Partner',
  worst_fail: 'Worst fail',
  worst_fail_date: 'Worst fail date',
  worst_fail_date_timezone: 'Worst fail time zone',
  coins_collected: 'Coins collected',
  completion_time: 'Completion time',
  // Metadata
  difficulty_opinion: 'Your difficulty',
  user_gddl_tier: 'Your GDDL tier',
  level_notes: 'Level notes',
  // Rating config
  rating_categories: 'Categories',
  include_enjoyment: 'Include enjoyment',
  enjoyment_weight: 'Enjoyment weight',
  enjoyment_sort_order: 'Enjoyment position',
  rating_mode: 'Rating mode',
}

// Fields whose stored value is a 0–100 internal rating and has to be converted
// before it is shown. `rating_score:<id>` is handled separately, by prefix.
const RATING_VALUE_FIELDS = new Set([
  'simple_rating',
  'enjoyment',
  'weighted_average',
])

const RATING_SCORE_PREFIX = 'rating_score:'

/**
 * The heading one field-change row is shown under.
 *
 * Per-category weighted scores are keyed by category **id**, not by the name
 * the category had at edit time — names are renameable and ids are not. The id
 * is resolved against the user's current categories; one that no longer exists
 * renders as a removed category rather than as a name that may since have moved
 * to a different one.
 */
export function fieldLabel(
  fieldName: string,
  categories: RatingCategory[]
): string {
  if (fieldName.startsWith(RATING_SCORE_PREFIX)) {
    const id = fieldName.slice(RATING_SCORE_PREFIX.length)
    return categories.find((c) => c.id === id)?.name ?? 'Removed category'
  }
  return FIELD_LABELS[fieldName] ?? fieldName.replace(/_/g, ' ')
}

export interface FieldValueContext {
  scale: RatingDisplayScale
  datePref: DateFormatPreference
}

/**
 * One side of a field change, rendered.
 *
 * @returns The display string, or null for "no value" — which the row renders
 * as an em dash. A null is distinct from the literal string "null", which a
 * caller would have to go out of its way to store.
 */
export function fieldValue(
  fieldName: string,
  raw: string | null,
  { scale, datePref }: FieldValueContext
): string | null {
  if (raw === null) return null

  if (
    fieldName.startsWith(RATING_SCORE_PREFIX) ||
    RATING_VALUE_FIELDS.has(fieldName)
  ) {
    const internal = Number(raw)
    return Number.isNaN(internal) ? raw : formatRating(internal, scale)
  }
  if (fieldName === 'rating_rank') return `#${raw}`
  if (fieldName === 'attempts' || fieldName === 'worst_fail') {
    const n = Number(raw)
    return Number.isNaN(n) ? raw : formatNumber(n)
  }
  if (
    fieldName === 'percentage' ||
    fieldName === 'run_from' ||
    fieldName === 'run_to'
  ) {
    return `${raw}%`
  }
  if (fieldName === 'date' || fieldName === 'worst_fail_date') {
    return formatDate(raw, datePref)
  }
  if (fieldName === 'difficulty_opinion') {
    return opinionLabel(raw)
  }
  if (raw === 'true') return 'Yes'
  if (raw === 'false') return 'No'
  if (fieldName === 'rating_mode') {
    return raw === 'WEIGHTED' ? 'Weighted' : 'Simple'
  }
  return raw
}

/** One category in a serialized `rating_categories` value. */
export interface ConfigCategory {
  name: string
  weight: number
  sortOrder: number
}

/**
 * Parses one side of a `rating_categories` change.
 *
 * The whole category list travels as a single JSON row rather than one row per
 * category, because a save adds, removes, renames and reweights categories at
 * once and a per-category row set would have to invent a stable identity for a
 * category that does not have one yet.
 *
 * @returns The list in priority order, or null when the value is absent or not
 * the JSON this reader expects — a row written by an older shape renders as its
 * raw value rather than throwing the whole feed away.
 */
export function parseConfigCategories(
  raw: string | null
): ConfigCategory[] | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
      .filter(
        (c): c is ConfigCategory =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as ConfigCategory).name === 'string' &&
          typeof (c as ConfigCategory).weight === 'number'
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
  } catch {
    return null
  }
}

/** "Gameplay — 35%", the way a category reads in a config diff. */
export function configCategoryLabel(category: ConfigCategory): string {
  return `${category.name} — ${Math.round(category.weight * 100)}%`
}

/** The one-line summary under a rating-config change. */
export function configSummary(changes: ActivityFieldChange[]): string {
  const mode = changes.find((c) => c.fieldName === 'rating_mode')
  const categories = changes.find((c) => c.fieldName === 'rating_categories')
  const after = parseConfigCategories(categories?.newValue ?? null)

  if (mode) {
    const to = mode.newValue === 'WEIGHTED' ? 'weighted' : 'simple'
    const count = after?.length
    return count
      ? `Switched to ${to} ratings — ${count} categor${count === 1 ? 'y' : 'ies'}`
      : `Switched to ${to} ratings`
  }
  if (after) return `${after.length} categor${after.length === 1 ? 'y' : 'ies'}`
  const count = changes.length
  return `${count} setting${count === 1 ? '' : 's'} changed`
}
