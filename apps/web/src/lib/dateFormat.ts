import type { DateFormatPreference } from '@/lib/api/me'
import { getZonedParts } from '@/lib/timezone'

function formatDateParts(
  yyyy: string,
  mm: string,
  dd: string,
  preference: DateFormatPreference
): string {
  switch (preference) {
    case 'MDY':
      return `${mm}/${dd}/${yyyy}`
    case 'DMY':
      return `${dd}/${mm}/${yyyy}`
    case 'ISO':
      return `${yyyy}-${mm}-${dd}`
    case 'YMD':
      return `${yyyy}/${mm}/${dd}`
    default:
      return `${mm}/${dd}/${yyyy}`
  }
}

export function formatDate(
  date: Date | string,
  preference: DateFormatPreference
): string {
  let yyyy: string
  let mm: string
  let dd: string
  // Calendar dates (e.g. a completion date with no time-of-day) arrive as
  // either a bare `yyyy-MM-dd` string or a UTC-midnight ISO string. Read the
  // calendar parts straight from the string so they don't shift a day in a
  // negative-UTC timezone. Real timestamps (Date objects, or ISO strings with
  // a real time) fall through to local components.
  const calendar =
    typeof date === 'string'
      ? date.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/)
      : null
  if (calendar) {
    yyyy = calendar[1]!
    mm = calendar[2]!
    dd = calendar[3]!
  } else {
    const d = typeof date === 'string' ? new Date(date) : date
    yyyy = d.getFullYear().toString()
    mm = String(d.getMonth() + 1).padStart(2, '0')
    dd = String(d.getDate()).padStart(2, '0')
  }
  return formatDateParts(yyyy, mm, dd, preference)
}

export function formatTimeOfDay(
  hour: number,
  minute: number,
  preference: DateFormatPreference
): string {
  const mm = String(minute).padStart(2, '0')
  if (preference === 'ISO') {
    return `${String(hour).padStart(2, '0')}:${mm}`
  }
  const period = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${mm} ${period}`
}

export interface EntryDateTimeDisplay {
  dateText: string
  timeText: string | null
  showZoneBadge: boolean
  zoneLabel: string | null
}

// Display for a ProgressUpdate/LevelProgress date field that may optionally
// carry a real time-of-day. `dateTimezone == null` means no time was entered
// (legacy rows and the common case) — falls through to `formatDate`'s
// existing calendar-only rendering unchanged. When a timezone IS present, the
// date/time shown are computed in THAT zone (not the viewer's), so an entry
// always displays the same wall-clock moment to every viewer. The zone badge
// shows whenever it differs from the viewer's current zone, or whenever it's
// UTC — UTC doubles as the legacy/no-time fallback convention, so it's always
// flagged explicitly rather than risk a viewer assuming an unlabeled time is
// already in their own zone.
export function formatEntryDateTime(
  date: Date | string | null,
  dateTimezone: string | null,
  datePreference: DateFormatPreference,
  viewerTimezone: string
): EntryDateTimeDisplay {
  if (date == null) {
    return { dateText: '', timeText: null, showZoneBadge: false, zoneLabel: null }
  }
  if (dateTimezone == null) {
    return {
      dateText: formatDate(date, datePreference),
      timeText: null,
      showZoneBadge: false,
      zoneLabel: null,
    }
  }
  const instant = typeof date === 'string' ? new Date(date) : date
  const { year, month, day, hour, minute } = getZonedParts(
    instant,
    dateTimezone
  )
  const dateText = formatDateParts(
    String(year),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
    datePreference
  )
  const timeText = formatTimeOfDay(hour, minute, datePreference)
  const showZoneBadge =
    dateTimezone !== viewerTimezone || dateTimezone === 'UTC'
  return { dateText, timeText, showZoneBadge, zoneLabel: dateTimezone }
}
