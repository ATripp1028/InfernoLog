// Server-side counterpart to the calendar-date half of apps/web/src/lib/timezone.ts's
// getZonedParts — used wherever a stored UTC instant needs to be read back as
// the calendar date it represents in the zone it was originally logged in
// (account export, import dedup/diff comparisons). See ProgressUpdate.date /
// LevelProgress.worstFailDate in schema.prisma: a null timezone means no
// time-of-day was entered (the value is midnight UTC, so a raw UTC slice is
// already correct); a non-null timezone means the stored instant must be read
// back through that zone to recover the calendar day the user intended.

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone)
  if (!fmt) {
    // en-CA formats numeric dates as yyyy-MM-dd.
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    partsFormatterCache.set(timeZone, fmt)
  }
  return fmt
}

/**
 * yyyy-MM-dd calendar date of `date`. When `timezone` is null (no time-of-day
 * was entered), this is a plain UTC slice — correct, since the stored instant
 * is midnight UTC by convention. When `timezone` is set, the date is derived
 * in THAT zone instead, since the stored instant may have rolled into a
 * different UTC calendar day than the one the user experienced/entered.
 */
export function zonedDateString(date: Date, timezone: string | null): string {
  if (!timezone) return date.toISOString().slice(0, 10)
  try {
    return partsFormatter(timezone).format(date)
  } catch {
    // Invalid/unrecognized zone (e.g. stale data from before validation was
    // added) — fall back to the UTC slice rather than throwing.
    return date.toISOString().slice(0, 10)
  }
}
