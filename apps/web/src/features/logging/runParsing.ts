// Parsing the community shorthand for a run — "63" for a run from 0%, "52-92"
// for one that started partway through. Pure; RunInput.tsx renders the box and
// whatever this reports back.
//
// Named runParsing rather than runInput so it cannot collide with
// RunInput.tsx on a case-insensitive filesystem.

/**
 * A run's start and end percentage, both 0–100 with `from < to`.
 */
export interface ParsedRun {
  from: number
  to: number
}

/**
 * The outcome of parsing a run string.
 *
 * `error` carries a user-facing message and, where the mistake has an obvious
 * correction (high-to-low bounds), a one-click `fix`.
 */
export type RunParseResult =
  | { kind: 'empty' }
  | { kind: 'error'; message: string; fix?: { label: string; value: string } }
  | { kind: 'ok'; from: number; to: number }

// Grammar: "N"/"N%" is a run from 0% to N; "A-B"/"A%-B%" (hyphen, en-dash, or
// em-dash, spaces tolerated) is a run that started partway through. Matches
// community shorthand for logging progress rather than inventing new syntax.
const RANGE_RE = /^\s*(\d{1,3})\s*%?\s*[-–—]\s*(\d{1,3})\s*%?\s*$/
const SINGLE_RE = /^\s*(\d{1,3})\s*%?\s*$/

/**
 * Parses the community shorthand for a run: `N`/`N%` for a run from 0%, or
 * `A-B` for one that started partway through.
 *
 * Hyphen, en-dash, and em-dash all work, and spaces are tolerated. Never
 * throws — every rejection comes back as an `error` result with copy the
 * field can render.
 */
export function parseRunInput(raw: string): RunParseResult {
  if (raw.trim() === '') return { kind: 'empty' }

  const rangeMatch = raw.match(RANGE_RE)
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1]!, 10)
    const b = parseInt(rangeMatch[2]!, 10)
    if (a > 100 || b > 100) {
      return { kind: 'error', message: 'Percentages must be 0–100.' }
    }
    if (a === b) {
      return {
        kind: 'error',
        message:
          'Start and end are the same — enter just one number for a run from 0%.',
      }
    }
    if (a > b) {
      return {
        kind: 'error',
        message: "That's high-to-low.",
        fix: { label: `Swap to ${b}–${a}`, value: `${b}-${a}` },
      }
    }
    return { kind: 'ok', from: a, to: b }
  }

  const singleMatch = raw.match(SINGLE_RE)
  if (singleMatch) {
    const n = parseInt(singleMatch[1]!, 10)
    if (n > 100) {
      return { kind: 'error', message: 'Percentages must be 0–100.' }
    }
    if (n === 0) {
      return {
        kind: 'error',
        message: "0% isn't a run — enter how far it reached.",
      }
    }
    return { kind: 'ok', from: 0, to: n }
  }

  return {
    kind: 'error',
    message:
      "Couldn't read that — try a number like 63, or a range like 52-92.",
  }
}

/**
 * Seeds the box from an existing entry's stored fields.
 */
export function formatRunInputValue(
  percentage: number | null,
  runFrom: number | null,
  runTo: number | null
): string {
  if (runFrom != null && runTo != null) return `${runFrom}-${runTo}`
  if (percentage != null) return String(Math.round(percentage))
  return ''
}
