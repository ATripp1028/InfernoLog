// Conversion between the internal 0–100 rating scale and the scale each field
// is shown on. Lives in lib/ rather than in the logging feature (where it
// started) because seven features render ratings and only one logs them.
//
// The scale is fixed per FIELD, not per user — the convention the GD community
// already uses:
//
//   scores     — per-category scores and the weighted average they combine
//                into: 0–10 with decimals (7.5).
//   enjoyment  — 0–100, whole numbers (85).
//
// Everything is still stored as an integer 0–100 either way, so enjoyment's
// display units and its stored units are the same number and it needs no
// conversion pair at all. Only scores cross a boundary.
//
// Category WEIGHTS cross a boundary of their own, for the same reason and in
// the same direction: the wire and the database speak a fraction of 1.00
// (`Decimal(5,2)`, so two places and no more), and every screen speaks whole
// percents. That conversion lives here too rather than as a `* 100` at each
// call site, where the copies had already started to differ in how they
// rounded.

/** Top of the score scale — category scores and the weighted average. */
export const SCORE_MAX = 10

/** Top of the enjoyment scale. Equal to the internal maximum, deliberately. */
export const ENJOYMENT_MAX = 100

/** Internal 0–100 → the 0–10 score display. Lossless; the inverse rounds. */
export function toScoreDisplay(internal: number): number {
  return internal / 10
}

/**
 * A 0–10 score display value → the internal 0–100 integer.
 *
 * Rounds, so a score keeps one decimal place and no more — 6.85 stores as 69,
 * not 68.5.
 */
export function toScoreInternal(display: number): number {
  return Math.round(display * 10)
}

/**
 * Internal 0–100 → a display string on the 0–10 score scale.
 *
 * Shows up to three decimal places (matching the weighted average's precision)
 * but trims trailing zeros, so "8" stays `8`, "6.80" reads `6.8`, and "6.345"
 * survives intact.
 */
export function formatScore(internal: number): string {
  return formatScoreDisplay(toScoreDisplay(internal))
}

/**
 * The same trimming as {@link formatScore} for a value already in 0–10 display
 * units — a weighted average computed from converted form inputs, say. Use this
 * rather than converting twice.
 */
export function formatScoreDisplay(display: number): string {
  return display.toFixed(3).replace(/\.?0+$/, '')
}

/**
 * Internal 0–100 → an enjoyment display string.
 *
 * Identity, since enjoyment is shown on the same 0–100 scale it is stored on.
 * It exists so call sites name the field they are rendering rather than
 * printing a bare number that looks like it was missed.
 */
export function formatEnjoyment(internal: number): string {
  return String(internal)
}

/** Top of the weight scale, in the percent units the UI speaks. */
export const WEIGHT_PERCENT_MAX = 100

/**
 * A stored weight fraction (0–1) → the whole percent shown and typed.
 *
 * Rounds, because the stored value has exactly two decimal places and a
 * percent has none — 0.34 is 34, and nothing finer is representable either
 * side of the boundary.
 */
export function toWeightPercent(weight: number): number {
  return Math.round(weight * 100)
}

/**
 * A whole percent → the 0–1 fraction the wire and database store.
 *
 * The inverse of {@link toWeightPercent}, and lossless in this direction:
 * `Decimal(5,2)` holds every whole percent exactly.
 */
export function toWeightFraction(percent: number): number {
  return Math.round(percent) / 100
}

/**
 * A stored weight fraction → a display string, percent sign included.
 *
 * The read-only counterpart to {@link toWeightPercent} — use it anywhere a
 * weight is printed rather than edited.
 */
export function formatWeightPercent(weight: number): string {
  return `${toWeightPercent(weight)}%`
}
