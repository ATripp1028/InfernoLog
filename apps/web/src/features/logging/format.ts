import type { RatingDisplayScale } from '@/lib/api/me'

// Strip everything but digits — used by the attempts / FPS / percentage inputs.
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

// Ratings/enjoyment are stored 0–100 internally; the display layer converts to
// the user's chosen scale (0–10 or 0–100). See DATA_MODEL.md.
export function displayMax(scale: RatingDisplayScale): number {
  return scale === 'ZERO_TO_TEN' ? 10 : 100
}

export function toDisplay(internal: number, scale: RatingDisplayScale): number {
  return scale === 'ZERO_TO_TEN' ? internal / 10 : internal
}

export function toInternal(display: number, scale: RatingDisplayScale): number {
  return Math.round(scale === 'ZERO_TO_TEN' ? display * 10 : display)
}

// Trim a trailing ".0" so a 0–10 score reads "8" not "8.0", but keeps "6.8".
export function formatRating(
  internal: number,
  scale: RatingDisplayScale
): string {
  const v = toDisplay(internal, scale)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}
