import { MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER } from '@infernolog/core'

/**
 * Re-exported so callers don't need a second import from @infernolog/core.
 */
export { MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER }

/**
 * Strip everything but digits — used by the attempts / FPS / percentage inputs.
 */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Digits clamped to a 0–100 percentage (empty stays empty). Percentage fields
 * are always trivially bounded (100), so silently clamping as you type is
 * harmless and predictable — unlike the otherwise-uncapped fields below,
 * there's no risk of ever needing to represent a legitimately huge value.
 */
export function clampPercent(value: string): string {
  return clampDigits(value, 100)
}

function clampDigits(value: string, max: number): string {
  const digits = digitsOnly(value)
  if (digits === '') return ''
  return String(Math.min(max, Number(digits)))
}

/**
 * Whether a digit-string field value exceeds `max` — used for otherwise-
 * uncapped numeric fields (attempts, FPS, GDDL tier) to BLOCK submission with
 * a visible error instead of silently rewriting what the user typed (that
 * used to be a silent Math.min clamp here; a huge paste/typo would just
 * vanish into a smaller number with no feedback, which is more confusing
 * than a blocked submit + a clear "must be at most N" message).
 */
export function numberExceedsMax(value: string, max: number): boolean {
  return value !== '' && Number(value) > max
}

/**
 * The inline error message for a field bounded by `numberExceedsMax`, or null
 * when the value is valid (including empty — these fields are all optional).
 */
export function maxValueError(value: string, max: number): string | null {
  return numberExceedsMax(value, max)
    ? `Must be ${max.toLocaleString('en-US')} or less`
    : null
}

/**
 * A number with thousands separators, in en-US grouping.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
