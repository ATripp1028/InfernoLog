/**
 * Human-readable song size from the raw megabyte float (e.g. 9.56 → "9.56 MB").
 */
export function formatSongSize(mb: number | null): string | null {
  if (mb == null) return null
  return `${mb.toFixed(2)} MB`
}

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
 * EDEL community enjoyment for display — one decimal, since the upstream figure
 * carries eight and the extra precision is noise.
 */
export function formatEnjoyment(enjoyment: number | null): string | null {
  if (enjoyment == null || !Number.isFinite(enjoyment)) return null
  return enjoyment.toFixed(1)
}
