// The numeric behaviour behind StepperInput: rounding, clamping, formatting,
// and what a typed draft or a step button resolves to. Pure — the component
// owns the markup and the draft/focus state.

/** How a stepper's value is constrained. */
export interface StepperBounds {
  min: number
  max: number
  /** Decimal places used for rounding and display. */
  precision: number
}

/**
 * Rounds to the stepper's precision.
 *
 * Accumulating steps in binary floating point drifts (0.1 + 0.2), so every
 * value the stepper produces is snapped back to its precision.
 */
export function roundTo(n: number, precision: number): number {
  const factor = 10 ** precision
  return Math.round(n * factor) / factor
}

/**
 * Constrains a value to the stepper's range.
 */
export function clampTo(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * The string shown in the field: fixed to the stepper's precision, falling
 * back to zero for a value that is not a finite number.
 */
export function formatValue(n: number, precision: number): string {
  return Number.isFinite(n)
    ? n.toFixed(precision)
    : (0).toFixed(precision)
}

/**
 * What a typed draft resolves to on blur.
 *
 * An empty field means zero (then clamped into range) — the user cleared it to
 * type, and leaving it empty should not strand the field on no value at all.
 * Anything unparseable leaves `current` untouched rather than zeroing work the
 * user did not mean to discard.
 */
export function commitValue(
  raw: string,
  current: number,
  { min, max, precision }: StepperBounds
): number {
  const trimmed = raw.trim()
  const parsed = trimmed === '' ? 0 : Number(trimmed)
  if (!Number.isFinite(parsed)) return current
  return clampTo(roundTo(parsed, precision), min, max)
}

/**
 * What a step button resolves to — the current value moved by `delta`, then
 * rounded and clamped.
 */
export function stepValue(
  current: number,
  delta: number,
  { min, max, precision }: StepperBounds
): number {
  return clampTo(roundTo(current + delta, precision), min, max)
}

/**
 * Strips the leading zero from a step-button label: 0.1 → ".1", 0.01 → ".01".
 * Compact, and avoids reading 0.10 as different from 0.1.
 */
export function formatDelta(d: number): string {
  const s = d.toString()
  return s.startsWith('0.') ? s.slice(1) : s
}

/**
 * The step deltas in render order for one side of the field, smallest always
 * closest to the input so the buttons read outward by magnitude.
 */
export function orderedDeltas(
  deltas: readonly number[],
  side: 'minus' | 'plus'
): number[] {
  const sorted = [...deltas].sort((a, b) => a - b)
  return side === 'minus' ? sorted.reverse() : sorted
}
