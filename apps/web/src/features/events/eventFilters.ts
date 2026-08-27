// The Events page's filter vocabulary and the pure date arithmetic behind the
// range picker.
//
// Kept out of the components so the chip labels and the range boundaries can be
// asserted directly — a range that is off by a day is invisible in a rendered
// feed and obvious in a test.

import type { ActivityFeedKind, LevelProgressListItem } from '@infernolog/core'

/** One filter chip: what the user calls it, and what it asks the API for. */
export interface KindChip {
  kind: ActivityFeedKind
  label: string
}

/**
 * The four chips, in display order.
 *
 * Deliberately not derived from the event-type enum. "Progress" is not an
 * activity_log row at all, "Edits" is one event type, and the hidden
 * DEMON_LIST_REBALANCE must never acquire a chip by something enumerating the enum
 * and rendering what it finds.
 */
export const KIND_CHIPS: KindChip[] = [
  { kind: 'PROGRESS', label: 'Progress' },
  { kind: 'DEMON_LIST', label: 'Demon list' },
  { kind: 'EDITS', label: 'Edits' },
  { kind: 'SETTINGS', label: 'Settings' },
]

export type ActivityRangeKey = 'any' | 'today' | 'week' | 'month' | 'custom'

/** The date-range options, in display order. */
export const ACTIVITY_RANGES: { key: ActivityRangeKey; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
  { key: 'custom', label: 'Custom range…' },
]

/** Explicit bounds for the `custom` range, as epoch ms. Either end may be open. */
export interface CustomRange {
  from: number | null
  to: number | null
}

/** Both ends open — what `custom` starts as before either box is filled. */
export const EMPTY_CUSTOM_RANGE: CustomRange = { from: null, to: null }

/**
 * The bounds one range option means, as ISO strings for the query.
 *
 * Bounds recorded time — when a thing was written down — which is the same
 * clock the feed orders by. Never the user-entered date: that is optionally
 * uncertain and can be back-dated, so a "Today" filter keyed off it would show
 * runs entered weeks ago.
 *
 * The `to` bound is pushed to the END of its day. A user picking the 25th on
 * both ends means that whole day, not the single instant of its midnight —
 * which would otherwise match nothing at all.
 *
 * @param now - Injected so the day boundary is testable.
 * @returns Nulls for an open bound, which send nothing for that end.
 */
export function rangeBounds(
  range: ActivityRangeKey,
  custom: CustomRange,
  now: Date = new Date()
): { from: string | null; to: string | null } {
  if (range === 'any') return { from: null, to: null }

  if (range === 'custom') {
    return {
      from: custom.from === null ? null : new Date(custom.from).toISOString(),
      to: custom.to === null ? null : endOfDay(new Date(custom.to)),
    }
  }

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (range === 'week') start.setDate(start.getDate() - 6)
  if (range === 'month') start.setDate(start.getDate() - 29)
  // The relative ranges all run up to now, so they need no upper bound.
  return { from: start.toISOString(), to: null }
}

function endOfDay(date: Date): string {
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return end.toISOString()
}

/** Whether a range option is actually narrowing anything. */
export function rangeIsActive(
  range: ActivityRangeKey,
  custom: CustomRange
): boolean {
  if (range === 'any') return false
  // "Custom range…" with both boxes empty is a chosen option that filters
  // nothing, so it must not light up Clear or read as an active filter.
  if (range === 'custom') return custom.from !== null || custom.to !== null
  return true
}

/**
 * One entry in the level filter's list — enough of the level to render the row
 * shared with every other "pick a level" surface.
 */
export interface LevelOption {
  levelId: string
  name: string | null
  creator: string | null
  songName: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
  /** Lowercased name + creator + id, for matching without re-deriving it per keystroke. */
  haystack: string
}

/**
 * The levels the filter offers, from the user's own List.
 *
 * Sorted by name so the list is scannable, and levels with no cached name fall
 * back to their GD id — which is the number a user recognises anyway.
 */
export function levelOptions(
  items: LevelProgressListItem[] | undefined
): LevelOption[] {
  if (!items) return []
  return items
    .map(({ level }) => ({
      levelId: level.inGameId,
      name: level.name,
      creator: level.creator,
      songName: level.songName,
      inGameDifficulty: level.inGameDifficulty,
      featured: level.featured,
      epicValue: level.epicValue,
      isRated: level.isRated,
      haystack: [level.name, level.creator, level.inGameId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }))
    .sort((a, b) => (a.name ?? a.levelId).localeCompare(b.name ?? b.levelId))
}

/** How many suggestions the level box shows at once. */
export const LEVEL_SUGGESTION_LIMIT = 8

/**
 * The levels matching what the user has typed, newest query first.
 *
 * Substring rather than fuzzy: this searches the user's OWN levels, which they
 * have already seen and can spell, and a fuzzy match over a few hundred rows
 * would surface near-misses above the exact one they typed.
 *
 * @param query - Empty shows the first {@link LEVEL_SUGGESTION_LIMIT} levels,
 * so opening the box is useful before typing anything.
 */
export function matchLevels(
  options: LevelOption[],
  query: string
): LevelOption[] {
  const q = query.trim().toLowerCase()
  const matched = q
    ? options.filter((option) => option.haystack.includes(q))
    : options
  return matched.slice(0, LEVEL_SUGGESTION_LIMIT)
}
