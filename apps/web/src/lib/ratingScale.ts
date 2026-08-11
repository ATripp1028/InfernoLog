// Conversion between the internal 0–100 rating scale and whatever scale the
// user chose to see. Lives in lib/ rather than in the logging feature (where
// it started) because seven features render ratings and only one logs them.

import type { RatingDisplayScale } from './api/wireEnums'

/**
 * The top of the user's chosen display scale — 10 or 100.
 *
 * Ratings and enjoyment are stored as integers 0–100 internally regardless of
 * this setting; conversion happens at the display layer alone. See
 * `RatingDisplayScale` in apps/api/prisma/schema.prisma.
 */
export function displayMax(scale: RatingDisplayScale): number {
  return scale === 'ZERO_TO_TEN' ? 10 : 100
}

/** Internal 0–100 → display units. Lossless; the inverse rounds. */
export function toDisplay(internal: number, scale: RatingDisplayScale): number {
  return scale === 'ZERO_TO_TEN' ? internal / 10 : internal
}

/**
 * Display units → the internal 0–100 integer.
 *
 * Rounds, so a 0–10 display value keeps one decimal place and no more —
 * 6.85 stores as 69, not 68.5.
 */
export function toInternal(display: number, scale: RatingDisplayScale): number {
  return Math.round(scale === 'ZERO_TO_TEN' ? display * 10 : display)
}

/**
 * Internal 0–100 → a display string on the user's scale.
 *
 * Shows up to three decimal places (matching the weighted average's
 * precision) but trims trailing zeros, so "8" stays `8`, "6.80" reads `6.8`,
 * and "6.345" survives intact.
 */
export function formatRating(
  internal: number,
  scale: RatingDisplayScale
): string {
  return formatDisplayRating(toDisplay(internal, scale))
}

/**
 * The same trimming as {@link formatRating} for a value already in display
 * units — a weighted average computed from converted form inputs, say. Use
 * this rather than converting twice.
 */
export function formatDisplayRating(display: number): string {
  return display.toFixed(3).replace(/\.?0+$/, '')
}
