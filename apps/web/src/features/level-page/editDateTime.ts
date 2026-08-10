// Date/time conversion shared by the level page's two edit modals: turning a
// stored instant + IANA zone into the values the DateTimeField inputs show,
// and composing those inputs back into what the API stores.

import { toast } from '@/components/ui/sonner'
import {
  getZonedParts,
  zonedTimeToUtc,
  NonexistentLocalTimeError,
} from '@/lib/timezone'

// Serialized ISO date (+ optional IANA zone it was entered in) → the date/time
// input values that pre-populate a DateTimeField. When a zone is present, the
// date is derived in THAT zone rather than sliced from raw UTC — an entry
// logged at 11:58 PM America/New_York is already the next day in UTC, so a
// naive slice would show the wrong calendar date back to the user.
export function zonedDateTimeInput(
  iso: string | null,
  timezone: string | null
): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  if (!timezone) return { date: (iso as string).slice(0, 10), time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const { year, month, day, hour, minute } = getZonedParts(d, timezone)
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return { date, time }
}

// Inverse of zonedDateTimeInput — date/time/timezone form fields → the
// {date, dateTimezone} pair the API expects (date as an ISO string, or null
// when the field was cleared). Returns 'invalid' (after toasting) when the
// entered time doesn't exist in that zone due to a DST transition; the
// caller should bail out of its save handler in that case.
export function composeZonedDate(
  date: string | null,
  time: string,
  timezone: string
): { date: string | null; dateTimezone: string | null } | 'invalid' {
  try {
    if (!date) return { date: null, dateTimezone: null }
    if (!time) return { date, dateTimezone: null }
    return {
      date: zonedTimeToUtc(date, time, timezone).toISOString(),
      dateTimezone: timezone,
    }
  } catch (err) {
    if (err instanceof NonexistentLocalTimeError) {
      toast.error(
        "That time doesn't exist in the selected time zone (daylight saving change) — pick a different time."
      )
      return 'invalid'
    }
    throw err
  }
}
