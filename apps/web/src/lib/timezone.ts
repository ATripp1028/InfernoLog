// Hand-rolled IANA timezone conversion — no date library dependency. Uses the
// standard Intl.DateTimeFormat.formatToParts offset-diff technique (the same
// approach libraries like date-fns-tz use internally under the hood).

/**
 * The IANA zone the browser is currently in.
 *
 * Compared against an entry's stored zone to decide whether the zone badge
 * shows: a viewer looking at their own zone's entries never sees one.
 */
export function getViewerTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Intl.supportedValuesOf isn't in this project's configured TS lib target —
 * call it through a loosely-typed reference rather than widening the shared
 * tsconfig's `lib` just for this one API.
 */
export function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }
  if (typeof intl.supportedValuesOf === 'function') {
    return intl.supportedValuesOf('timeZone')
  }
  return [getViewerTimezone()]
}

/**
 * Wall-clock calendar/time parts, with `month` 1-12 (not the `Date` 0-11 convention).
 */
export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

function buildFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// The write-time schema validates dateTimezone against real IANA names, but
// this still needs to tolerate a bad value reaching render — pre-existing
// data from before that validation was added, or a non-web API caller that
// bypassed it. `new Intl.DateTimeFormat` throws RangeError for an unknown
// zone; fall back to UTC (cached under the original key) instead of crashing
// every viewer of the entry.
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone)
  if (!fmt) {
    try {
      fmt = buildFormatter(timeZone)
    } catch {
      fmt = buildFormatter('UTC')
    }
    partsFormatterCache.set(timeZone, fmt)
  }
  return fmt
}

function extractParts(date: Date, timeZone: string): Record<string, number> {
  const parts = partsFormatter(timeZone).formatToParts(date)
  const map: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = Number(part.value)
  }
  return map
}

/**
 * Wall-clock parts of a UTC instant AS EXPERIENCED in `timeZone` — this is
 * what display code should use, so an entry always shows the same local time
 * to every viewer instead of being reinterpreted into the viewer's own zone.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const p = extractParts(date, timeZone)
  return {
    year: p.year!,
    month: p.month!,
    day: p.day!,
    hour: p.hour!,
    minute: p.minute!,
  }
}

/**
 * Thrown when the requested local wall-clock time never occurred in the
 * given zone — the DST "spring forward" gap (e.g. 2:30 AM on the day clocks
 * jump from 2:00 to 3:00). There is no correct UTC instant to return, so
 * callers should catch this and ask the user to enter a different time
 * rather than silently storing an instant that redisplays as a different
 * hour than what they typed.
 */
export class NonexistentLocalTimeError extends Error {
  constructor(dateStr: string, timeStr: string, timeZone: string) {
    super(`${timeStr} on ${dateStr} does not exist in ${timeZone}`)
    this.name = 'NonexistentLocalTimeError'
  }
}

/**
 * Converts a local wall-clock `yyyy-MM-dd` + `HH:mm` entered in `timeZone` to
 * the correct UTC instant. DST-safe via a fixed-point offset correction: form
 * a UTC guess, measure how far that guess's own wall-clock (in `timeZone`)
 * lands from the target, and shift by that offset — repeated twice so a
 * guess landing on the wrong side of a DST transition still converges. A
 * final round-trip check catches the one case iteration can't fix: a local
 * time that never occurred (the spring-forward gap above), which throws
 * instead of returning a silently-shifted instant. A local time that
 * occurred TWICE (the fall-back overlap) is not flagged — it resolves to the
 * earlier (pre-transition) occurrence, matching how most date libraries
 * default without extra configuration.
 */
export function zonedTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string
): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const target = Date.UTC(y!, mo! - 1, d!, h!, mi!)

  let instant = target
  for (let i = 0; i < 2; i++) {
    const seen = extractParts(new Date(instant), timeZone)
    const seenAsUtc = Date.UTC(
      seen.year!,
      seen.month! - 1,
      seen.day!,
      seen.hour!,
      seen.minute!,
      seen.second ?? 0
    )
    const offset = seenAsUtc - instant
    instant = target - offset
  }

  const roundTrip = extractParts(new Date(instant), timeZone)
  if (roundTrip.hour !== h || roundTrip.minute !== mi) {
    throw new NonexistentLocalTimeError(dateStr, timeStr, timeZone)
  }

  return new Date(instant)
}
