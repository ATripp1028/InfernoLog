// Level durations as a clock reading, both ways. Lives in lib/ because the
// Global Level Page renders one and the /search duration filter reads one back.

/**
 * Level duration from whole seconds, as a clock reading ("2:01", "1:04:09").
 *
 * Hours are shown only when there are any, so the common case stays two
 * segments — nearly every level is minutes long, and "0:02:01" reads as a
 * stopwatch rather than a length.
 *
 * @returns null when the duration is unknown, which is the caller's cue to fall
 *   back to RobTop's coarse band ("Long").
 */
export function formatDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  const whole = Math.round(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`
}

/**
 * A typed duration in whole seconds — the inverse of {@link formatDuration}.
 *
 * Accepts "m:ss", "h:mm:ss", or bare seconds ("90"). Every segment after the
 * first is a clock field and must be under 60, so "1:75" is rejected rather
 * than quietly read as 2:15.
 *
 * @returns null for anything else, including an empty string.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim()
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null
  const parts = t.split(':').map(Number)
  if (parts.slice(1).some((p) => p >= 60)) return null
  return parts.reduce((total, p) => total * 60 + p, 0)
}
