// Which fields a LOG_EDIT event records, and under which filter category.
//
// The scope is deliberately narrow: the fields a user would describe as
// "editing my log entry". Administrative fields — the privacy toggle, video and
// highlight URLs — are edited on the same form but are not part of the story an
// activity feed tells, so they are absent from the table below and therefore
// never produce a field-change row.
//
// Adding a new editable field means adding one line here. Nothing downstream
// enumerates fields: every filter keys off `category` (see the
// ActivityFieldCategory enum in schema.prisma), which is the whole reason the
// tag exists.

import { ActivityFieldCategory } from '@prisma/client'
import type { Prisma } from '@prisma/client'

/** One entry in {@link LOG_EDIT_FIELD_SCOPE}. */
export interface FieldScopeEntry {
  /** Raw snake_case identifier written to `activity_log_field_change.fieldName`. */
  fieldName: string
  /** The filter tag. Never filter on `fieldName`. */
  category: ActivityFieldCategory
}

const { RATING, SESSION_DETAIL, METADATA } = ActivityFieldCategory

/**
 * In-scope edit fields, keyed by the Prisma column name that
 * `applyEdit` writes — which is also the key `EditProgressInput` uses, so one
 * table covers both the LevelProgress and the ProgressUpdate half of a save.
 *
 * A key absent from this table is out of scope by definition. `visibility`,
 * `videoUrl` and `highlightUrl` are absent on purpose; so is
 * `progressUpdateId`, which selects the target rather than changing it.
 *
 * The timezone columns get their own rows rather than folding into their date:
 * they are separate columns, they are always written together with the date
 * (see the `dateTimezone` comments in `applyEdit`), and a row that says the
 * zone changed is more honest than a date value with a zone smuggled inside it.
 */
export const LOG_EDIT_FIELD_SCOPE: Readonly<Record<string, FieldScopeEntry>> = {
  // ── Rating: how the user scores the level ────────────────────────────────
  simpleRating: { fieldName: 'simple_rating', category: RATING },
  enjoyment: { fieldName: 'enjoyment', category: RATING },

  // ── Session detail: the run this entry describes ─────────────────────────
  percentage: { fieldName: 'percentage', category: SESSION_DETAIL },
  runFrom: { fieldName: 'run_from', category: SESSION_DETAIL },
  runTo: { fieldName: 'run_to', category: SESSION_DETAIL },
  attempts: { fieldName: 'attempts', category: SESSION_DETAIL },
  date: { fieldName: 'date', category: SESSION_DETAIL },
  dateTimezone: { fieldName: 'date_timezone', category: SESSION_DETAIL },
  dateUncertain: { fieldName: 'date_uncertain', category: SESSION_DETAIL },
  fps: { fieldName: 'fps', category: SESSION_DETAIL },
  percentageVersion: {
    fieldName: 'percentage_version',
    category: SESSION_DETAIL,
  },
  onStream: { fieldName: 'on_stream', category: SESSION_DETAIL },
  device: { fieldName: 'device', category: SESSION_DETAIL },
  notes: { fieldName: 'notes', category: SESSION_DETAIL },
  twoPlayerSolo: { fieldName: 'two_player_solo', category: SESSION_DETAIL },
  twoPlayerPartner: {
    fieldName: 'two_player_partner',
    category: SESSION_DETAIL,
  },
  worstFail: { fieldName: 'worst_fail', category: SESSION_DETAIL },
  worstFailDate: { fieldName: 'worst_fail_date', category: SESSION_DETAIL },
  worstFailDateTimezone: {
    fieldName: 'worst_fail_date_timezone',
    category: SESSION_DETAIL,
  },
  coinsCollected: { fieldName: 'coins_collected', category: SESSION_DETAIL },
  completionTime: { fieldName: 'completion_time', category: SESSION_DETAIL },

  // ── Metadata: the user's read of the LEVEL, not of one run ───────────────
  difficultyOpinion: { fieldName: 'difficulty_opinion', category: METADATA },
  userGddlTier: { fieldName: 'user_gddl_tier', category: METADATA },
  levelNotes: { fieldName: 'level_notes', category: METADATA },
}

/**
 * The `fieldName` for one weighted-mode category's score.
 *
 * Keyed by category id rather than by the category's name at edit time: names
 * are renameable and the id is not, and the name history is recoverable from
 * this user's RATING_CONFIG_CHANGE events. A reader resolves the id against the
 * user's current categories; one that no longer exists renders as a removed
 * category rather than as a name that may since have moved to a different one.
 */
export function ratingScoreFieldName(categoryId: string): string {
  return `rating_score:${categoryId}`
}

/**
 * Renders any in-scope field value as the string the change row stores.
 *
 * `null` is reserved for "no value" — it is what an absent, cleared, or
 * never-set field serializes to, and is distinct from a user-typed `"null"`.
 * Prisma `Decimal` values go through `toNumber()` first so a percentage stored
 * as `85.00` and one supplied as `85` compare equal rather than reading as an
 * edit that changed nothing.
 */
export function serializeFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && 'toNumber' in value) {
    return String((value as Prisma.Decimal).toNumber())
  }
  return String(value)
}

/** A single row destined for `activity_log_field_change`. */
export interface FieldChange {
  fieldName: string
  category: ActivityFieldCategory
  oldValue: string | null
  newValue: string | null
}

/**
 * Diffs the values a save is about to write against the values already stored,
 * dropping every field that is out of scope or unchanged.
 *
 * Driven by `written` rather than by the request body on purpose: `applyEdit`
 * derives writes the client never sent (setting `percentage` clears `runFrom`/
 * `runTo`), and those are real changes to the entry. Passing the update payload
 * is what catches them.
 *
 * @param before - Current column values, keyed by Prisma column name.
 * @param written - The values being written, keyed the same way. Keys missing
 * from {@link LOG_EDIT_FIELD_SCOPE} are ignored.
 * @returns One entry per in-scope field whose serialized value actually
 * changed. Empty when the save is a no-op as far as the log is concerned.
 */
export function buildFieldChanges(
  before: Record<string, unknown>,
  written: Record<string, unknown>
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const [key, value] of Object.entries(written)) {
    const scope = LOG_EDIT_FIELD_SCOPE[key]
    if (!scope) continue
    const oldValue = serializeFieldValue(before[key])
    const newValue = serializeFieldValue(value)
    if (oldValue === newValue) continue
    changes.push({ ...scope, oldValue, newValue })
  }
  return changes
}

/**
 * Diffs the weighted-mode score set, producing one row per category whose score
 * was added, removed, or changed.
 *
 * `applyEdit` replaces the score set wholesale, so a category missing from
 * `after` had its score cleared — that is a change, not an omission.
 *
 * @param before - The stored scores for this entry.
 * @param after - The scores the save is writing. `undefined` means the save did
 * not touch ratings at all, which produces no rows.
 */
export function buildRatingScoreChanges(
  before: ReadonlyArray<{ categoryId: string; score: number }>,
  after: ReadonlyArray<{ categoryId: string; score: number }> | undefined
): FieldChange[] {
  if (after === undefined) return []
  const beforeMap = new Map(before.map((s) => [s.categoryId, s.score]))
  const afterMap = new Map(after.map((s) => [s.categoryId, s.score]))

  const changes: FieldChange[] = []
  for (const categoryId of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    const oldValue = serializeFieldValue(beforeMap.get(categoryId) ?? null)
    const newValue = serializeFieldValue(afterMap.get(categoryId) ?? null)
    if (oldValue === newValue) continue
    changes.push({
      fieldName: ratingScoreFieldName(categoryId),
      category: RATING,
      oldValue,
      newValue,
    })
  }
  return changes
}
