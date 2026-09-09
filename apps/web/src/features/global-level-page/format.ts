/**
 * Human-readable song size from the raw megabyte float (e.g. 9.56 → "9.56 MB").
 */
export function formatSongSize(mb: number | null): string | null {
  if (mb == null) return null
  return `${mb.toFixed(2)} MB`
}
