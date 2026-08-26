// The Log page's vocabulary, and the pure shaping the feed rows read from.
//
// One sentence shape and one colour family per kind of entry, kept here rather
// than inline in the row components so the wording is in one place. The event
// TYPE names never reach the user: "Placed … in your ranking", not
// RANKING_PLACEMENT. RANKING_REBALANCE has no entry at all — it is filtered out
// server-side and can never arrive.

import type {
  ActivityFeedEvent,
  ActivityFeedItem,
  ActivityFieldCategory,
  ProgressUpdateKind,
} from '@infernolog/core'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import { formatDate } from '@/lib/dateFormat'
import { formatNumber } from '@/features/logging/format'

/** The colour family a row's icon and accents use. */
export type FeedTone =
  | 'ranking'
  | 'edit'
  | 'settings'
  | 'success'
  | 'danger'
  | 'neutral'

/**
 * One day's worth of feed entries, in the order the feed returned them.
 *
 * The heading is the recorded day, not the day the user says the run happened
 * — a back-dated completion sits under the day it was written down.
 */
export interface FeedDay {
  /** `yyyy-MM-dd` in the viewer's zone; the grouping key, never displayed raw. */
  key: string
  heading: string
  items: ActivityFeedItem[]
}

function dayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Groups a flat feed into consecutive day sections.
 *
 * The two most recent days get relative headings, which is what makes a feed
 * read as "what I have been doing" rather than as a table of dates.
 *
 * @param now - Injected so the Today/Yesterday boundary is testable.
 */
export function groupByDay(
  items: ActivityFeedItem[],
  datePref: DateFormatPreference,
  now: Date = new Date()
): FeedDay[] {
  const today = dayKey(now)
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterday = dayKey(yesterdayDate)

  const days: FeedDay[] = []
  for (const item of items) {
    const recorded = new Date(item.recordedAt)
    const key = dayKey(recorded)
    const last = days[days.length - 1]
    if (last?.key === key) {
      last.items.push(item)
      continue
    }
    const heading =
      key === today
        ? 'Today'
        : key === yesterday
          ? 'Yesterday'
          : formatDate(recorded, datePref)
    days.push({ key, heading, items: [item] })
  }
  return days
}

/** The clock time a row shows on its right, in the viewer's zone. */
export function recordedTime(
  recordedAt: Date | string,
  datePref: DateFormatPreference
): string {
  const date = new Date(recordedAt)
  const hour = date.getHours()
  const minute = String(date.getMinutes()).padStart(2, '0')
  if (datePref === 'ISO') return `${String(hour).padStart(2, '0')}:${minute}`
  const period = hour < 12 ? 'AM' : 'PM'
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${period}`
}

/**
 * The lead verb of a progress row, and the tone that goes with it.
 *
 * A completion and a drop are the two entries worth colouring; an ordinary
 * progress log is the most common row on the page and stays quiet.
 */
export function progressVerb(kind: ProgressUpdateKind): {
  verb: string
  tone: FeedTone
} {
  if (kind === 'COMPLETION') return { verb: 'Beat', tone: 'success' }
  if (kind === 'DROP') return { verb: 'Dropped', tone: 'danger' }
  return { verb: 'Logged', tone: 'neutral' }
}

/** The percentage or run range a progress row states, or null when it has none. */
export function progressReach(item: {
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  kind: ProgressUpdateKind
}): string | null {
  if (item.kind === 'COMPLETION') return '100%'
  if (item.runFrom !== null || item.runTo !== null) {
    return `${item.runFrom ?? 0}–${item.runTo ?? 100}%`
  }
  return item.percentage === null ? null : `${item.percentage}%`
}

/** "43,530 attempts", or null when none were recorded. */
export function attemptsLabel(attempts: number | null): string | null {
  return attempts === null ? null : `${formatNumber(attempts)} attempts`
}

/** A 1-based ranking position as the log writes it: `#4`, or "unranked". */
export function positionLabel(position: number | null): string {
  return position === null ? 'unranked' : `#${position}`
}

/** "Entered the top 5" / "Left the top 25", or null when nothing was crossed. */
export function milestoneLabel(
  milestone: number | null,
  positionBefore: number | null,
  positionAfter: number | null
): string | null {
  if (milestone === null) return null
  // Direction is read off the positions rather than stored twice — entering the
  // top 10 and falling out of it are both recorded as `10`.
  const leaving =
    positionAfter === null ||
    (positionBefore !== null && positionAfter > positionBefore)
  return `${leaving ? 'Left' : 'Entered'} the top ${milestone}`
}

/** The lead phrase and tone for one activity event. */
export function eventTone(event: ActivityFeedEvent): FeedTone {
  switch (event.eventType) {
    case 'RANKING_PLACEMENT':
    case 'RANKING_REORDER':
    case 'RANKING_UNRANKED':
    case 'RANKING_BULK_REPLACE':
      return 'ranking'
    case 'LOG_EDIT':
      return 'edit'
    case 'RATING_CONFIG_CHANGE':
      return 'settings'
  }
}

/**
 * The one-line summary under a bulk replace: how many levels it moved, and how
 * many it dropped out of the ranking altogether.
 */
export function bulkReplaceSummary(event: ActivityFeedEvent): string {
  const dropped = event.levelImpacts.filter(
    (i) => i.positionAfter === null
  ).length
  const levels = `${formatNumber(event.impactCount)} level${
    event.impactCount === 1 ? '' : 's'
  } reordered`
  // Only countable from the preview, so it is stated only when the preview
  // holds the whole event rather than a capped window of it.
  const complete = event.levelImpacts.length === event.impactCount
  return complete && dropped > 0
    ? `${levels} — ${formatNumber(dropped)} dropped out`
    : levels
}

// Which field-change rows belong under which heading in an expanded edit, in
// display order. `RATING_CONFIG` is absent: it only ever appears on a settings
// event, which has its own detail rendering.
const EDIT_SECTIONS: { category: ActivityFieldCategory; heading: string }[] = [
  { category: 'RATING', heading: 'Rating' },
  { category: 'SESSION_DETAIL', heading: 'Session details' },
  { category: 'METADATA', heading: 'About the level' },
]

/**
 * The two figures a rating change records that no column holds today — the
 * level's overall rating and where it sits in the user's rating order.
 *
 * Grouped apart from the rating fields the user actually typed, because they
 * are the CONSEQUENCE of the save rather than part of it.
 */
export const DERIVED_RATING_FIELDS = ['weighted_average', 'rating_rank']

/** The headings an expanded edit shows, and the rows under each. */
export function editSections(event: ActivityFeedEvent) {
  const derived = event.fieldChanges.filter((f) =>
    DERIVED_RATING_FIELDS.includes(f.fieldName)
  )
  const sections = EDIT_SECTIONS.map(({ category, heading }) => ({
    heading,
    rows: event.fieldChanges.filter(
      (f) =>
        f.category === category && !DERIVED_RATING_FIELDS.includes(f.fieldName)
    ),
  })).filter((section) => section.rows.length > 0)
  return { sections, derived }
}

/**
 * The one-line summary under an edit: how many fields moved, and which parts of
 * the entry they belong to.
 */
export function editSummary(event: ActivityFeedEvent): string {
  const { sections, derived } = editSections(event)
  const count = event.fieldChanges.length - derived.length
  const fields = `${count} field${count === 1 ? '' : 's'} changed`
  const parts = sections.map((s) => s.heading.toLowerCase())
  return parts.length > 0 ? `${fields} — ${parts.join(', ')}` : fields
}

/**
 * "Up 43 in your rating ranking" — the headline a rating change earns, or null
 * when the save did not move the level's rating position.
 *
 * Lower is better, so a fall in the number is a rise in the ranking.
 */
export function ratingRankHeadline(event: ActivityFeedEvent): string | null {
  const row = event.fieldChanges.find((f) => f.fieldName === 'rating_rank')
  if (!row) return null
  const before = row.oldValue === null ? null : Number(row.oldValue)
  const after = row.newValue === null ? null : Number(row.newValue)
  if (after === null) return null
  if (before === null) return `New at #${after} in your rating ranking`
  const moved = before - after
  if (moved === 0) return null
  return `${moved > 0 ? 'Up' : 'Down'} ${Math.abs(moved)} in your rating ranking`
}
