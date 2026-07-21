import { MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER } from '@infernolog/core'
import type { RatingDisplayScale } from '@/lib/api/me'

// Re-exported so callers don't need a second import from @infernolog/core.
export { MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER }

// Strip everything but digits — used by the attempts / FPS / percentage inputs.
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

// Digits clamped to a 0–100 percentage (empty stays empty). Percentage fields
// are always trivially bounded (100), so silently clamping as you type is
// harmless and predictable — unlike the otherwise-uncapped fields below,
// there's no risk of ever needing to represent a legitimately huge value.
export function clampPercent(value: string): string {
  return clampDigits(value, 100)
}

function clampDigits(value: string, max: number): string {
  const digits = digitsOnly(value)
  if (digits === '') return ''
  return String(Math.min(max, Number(digits)))
}

// Whether a digit-string field value exceeds `max` — used for otherwise-
// uncapped numeric fields (attempts, FPS, GDDL tier) to BLOCK submission with
// a visible error instead of silently rewriting what the user typed (that
// used to be a silent Math.min clamp here; a huge paste/typo would just
// vanish into a smaller number with no feedback, which is more confusing
// than a blocked submit + a clear "must be at most N" message).
export function numberExceedsMax(value: string, max: number): boolean {
  return value !== '' && Number(value) > max
}

// The inline error message for a field bounded by `numberExceedsMax`, or null
// when the value is valid (including empty — these fields are all optional).
export function maxValueError(value: string, max: number): string | null {
  return numberExceedsMax(value, max)
    ? `Must be ${max.toLocaleString('en-US')} or less`
    : null
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
