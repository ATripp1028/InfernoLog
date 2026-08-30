// Colour for a rating value, on the red-white-green scale a spreadsheet would
// give it — the same three-colour conditional format Google Sheets applies by
// default, which is what these ratings looked like before they lived in an app.
//
// Ratings are stored as integers 0–100 internally whatever the user's display
// scale (see lib/ratingScale), so this takes the internal value and needs no
// scale argument: a perfect score is 100 and a zero is 0 on both the 0–10 and
// the 0–100 display.

/** Sheets' three-colour scale: the low, middle and high stops. */
const LOW = [248, 105, 107] as const // #f8696b
const MID = [255, 255, 255] as const // #ffffff
const HIGH = [99, 190, 123] as const // #63be7b

/**
 * A flawless score — lifted out of the gradient because the top of a green ramp
 * is not visibly different from a 9.8, and a 10 is worth seeing.
 */
const PERFECT = '#ffd43b'

/**
 * The other end, for the same reason. The gradient's low stop is a soft salmon
 * that reads as "poor"; an outright zero deserves to read as a verdict.
 */
const ZERO = '#dc143c'

/**
 * The colour a rating should be drawn in, or `undefined` for no rating — which
 * leaves the caller's own text colour in place rather than inventing one.
 *
 * @param internal - The rating on the internal 0–100 scale. Values outside it
 * are clamped, so a weighted average that rounds a hair past 100 still reads as
 * perfect rather than wrapping.
 */
export function ratingColor(internal: number | null): string | undefined {
  if (internal == null) return undefined

  const value = Math.min(100, Math.max(0, internal))
  if (value >= 100) return PERFECT
  if (value <= 0) return ZERO

  // Two half-ramps meeting at white in the middle, which is what makes a
  // mid-table rating read as neutral rather than as a weak green.
  return value < 50
    ? mix(LOW, MID, value / 50)
    : mix(MID, HIGH, (value - 50) / 50)
}

function mix(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number
): string {
  const channel = (i: number) => Math.round(from[i]! + (to[i]! - from[i]!) * t)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}
