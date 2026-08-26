// The Log page's filter vocabulary and the pure date arithmetic behind the
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
 * RANKING_REBALANCE must never acquire a chip by something enumerating the enum
 * and rendering what it finds.
 */
export const KIND_CHIPS: KindChip[] = [
  { kind: 'PROGRESS', label: 'Progress' },
  { kind: 'RANKING', label: 'Ranking' },
  { kind: 'EDITS', label: 'Edits' },
  { kind: 'SETTINGS', label: 'Settings' },
]

/** The sentinel the level Select uses for "no level filter". */
export const ALL_LEVELS = '__all__'

export type ActivityRangeKey = 'any' | 'today' | 'week' | 'month'

/** The date-range options, in display order. */
export const ACTIVITY_RANGES: { key: ActivityRangeKey; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
]

/**
 * The `from` bound one range option means, as an ISO string.
 *
 * Bounds recorded time — when a thing was written down — which is the same
 * clock the feed orders by. Never the user-entered date: that is optionally
 * uncertain and can be back-dated, so a "Today" filter keyed off it would show
 * runs entered weeks ago.
 *
 * @param now - Injected so the day boundary is testable.
 * @returns null for "Any time", which sends no bound at all.
 */
export function rangeStart(
  range: ActivityRangeKey,
  now: Date = new Date()
): string | null {
  if (range === 'any') return null
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (range === 'week') start.setDate(start.getDate() - 6)
  if (range === 'month') start.setDate(start.getDate() - 29)
  return start.toISOString()
}

/** One entry in the level filter's dropdown. */
export interface LevelOption {
  levelId: string
  name: string
}

/**
 * The levels the filter offers, from the user's own List.
 *
 * Sorted by name so the dropdown is scannable, and levels with no cached name
 * fall back to their GD id — which is the number a user recognises anyway.
 */
export function levelOptions(
  items: LevelProgressListItem[] | undefined
): LevelOption[] {
  if (!items) return []
  return items
    .map((item) => ({
      levelId: item.level.inGameId,
      name: item.level.name ?? item.level.inGameId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
