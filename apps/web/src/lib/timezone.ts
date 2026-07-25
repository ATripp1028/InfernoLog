// Hand-rolled IANA timezone conversion — no date library dependency. Uses the
// standard Intl.DateTimeFormat.formatToParts offset-diff technique (the same
// approach libraries like date-fns-tz use internally under the hood).

export function getViewerTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Intl.supportedValuesOf isn't in this project's configured TS lib target —
// call it through a loosely-typed reference rather than widening the shared
// tsconfig's `lib` just for this one API.
export function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }
  if (typeof intl.supportedValuesOf === 'function') {
    return intl.supportedValuesOf('timeZone')
  }
  return [getViewerTimezone()]
}

export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
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

// Wall-clock parts of a UTC instant AS EXPERIENCED in `timeZone` — this is
// what display code should use, so an entry always shows the same local time
// to every viewer instead of being reinterpreted into the viewer's own zone.
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

// Converts a local wall-clock `yyyy-MM-dd` + `HH:mm` entered in `timeZone` to
// the correct UTC instant. DST-safe via a single offset-correction pass: form
// a UTC guess, measure how far that guess's own wall-clock (in `timeZone`)
// lands from the target, and shift by that offset.
export function zonedTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string
): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y!, mo! - 1, d!, h!, mi!)
  const seen = extractParts(new Date(guess), timeZone)
  const seenAsUtc = Date.UTC(
    seen.year!,
    seen.month! - 1,
    seen.day!,
    seen.hour!,
    seen.minute!,
    seen.second ?? 0
  )
  const offset = seenAsUtc - guess
  return new Date(guess - offset)
}
