// Logic for Timeline: the per-entry labels its cards render — the
// percentage/run label, and the date/time/zone triple resolved against the
// viewer's own timezone.

import { formatEntryDateTime } from '@/lib/dateFormat'
import { getViewerTimezone } from '@/lib/timezone'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import type { ProgressUpdate } from '@/lib/api/levelPage'

const VIEWER_TZ = getViewerTimezone()

/**
 * Percentage / run label for a progress update
 */
export function rangeLabel(update: ProgressUpdate): string {
  if (update.kind === 'COMPLETION') return '100%'
  if (update.runFrom != null && update.runTo != null) {
    return `run ${update.runFrom} → ${update.runTo}%`
  }
  if (update.percentage != null) return `${update.percentage}%`
  return '—'
}

/**
 * A timeline entry's date, in the user's format, with its time and zone badge
 * when the entry carries one.
 *
 * A `null` timezone means no time-of-day was ever entered, which is the common
 * case and renders as a bare date.
 */
export function formatEntryDate(
  dateStr: string | null,
  dateTimezone: string | null,
  loggedAt: string,
  uncertain: boolean,
  datePref: DateFormatPreference
): {
  text: string
  timeText: string | null
  zoneSuffix: string | null
  uncertain: boolean
} {
  if (!dateStr) {
    const { dateText } = formatEntryDateTime(
      loggedAt,
      null,
      datePref,
      VIEWER_TZ
    )
    return {
      text: dateText,
      timeText: null,
      zoneSuffix: null,
      uncertain: false,
    }
  }
  const { dateText, timeText, showZoneBadge, zoneLabel } = formatEntryDateTime(
    dateStr,
    dateTimezone,
    datePref,
    VIEWER_TZ
  )
  return {
    text: dateText,
    timeText,
    zoneSuffix: showZoneBadge ? zoneLabel : null,
    uncertain,
  }
}
