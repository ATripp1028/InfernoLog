/**
 * Human-readable song size from the raw megabyte float (e.g. 9.56 → "9.56 MB").
 */
export function formatSongSize(mb: number | null): string | null {
  if (mb == null) return null
  return `${mb.toFixed(2)} MB`
}

/**
 * Community enjoyment for display — up to two decimal places, the precision
 * EDEL itself shows and the API stores both sources at. Trailing zeros are
 * dropped ("50", "49.5", "59.39"), so a whole-number score doesn't read as more
 * precise than it is.
 */
export function formatEnjoyment(enjoyment: number | null): string | null {
  if (enjoyment == null || !Number.isFinite(enjoyment)) return null
  return String(Math.round(enjoyment * 100) / 100)
}
