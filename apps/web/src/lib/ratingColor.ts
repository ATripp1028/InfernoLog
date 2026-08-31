// Colour for a rating value, on the red-white-green scale a spreadsheet would
// give it — the same three-colour conditional format Google Sheets applies by
// default, which is what these ratings looked like before they lived in an app.
//
// Ratings are stored as integers 0–100 internally whatever the user's display
// scale (see lib/ratingScale), so these take the internal value and need no
// scale argument: the top of the scale is 100 and the bottom is 0 on both the
// 0–10 and the 0–100 display.
//
// The gradient is shared, but what counts as an extreme is not, which is why
// there are two entry points rather than one:
//
//   scoreColor   — a single category score, where a flat 10 or 0 is a real
//                  thing a user types, so the exceptions sit at the ends of the
//                  SCALE.
//   overallColor — a weighted average, where landing on exactly 10 or 0 needs
//                  every category to agree and so almost never happens. Its
//                  exceptions sit at the ends of the RANKING instead: the
//                  user's best-rated level and their worst-rated one.

/** Sheets' three-colour scale: the low, middle and high stops. */
const LOW = [248, 105, 107] as const // #f8696b
const MID = [255, 255, 255] as const // #ffffff
const HIGH = [99, 190, 123] as const // #63be7b

/** The best thing on the list. */
const BEST = '#ffd43b'

/** The worst thing on the list. */
const WORST = '#dc143c'

/**
 * The gradient alone, with no exceptions applied.
 *
 * For a value with no position to judge it by — the live preview while a rating
 * is being edited, where the rank it will land at is the thing in flux.
 */
export function ratingRampColor(internal: number | null): string | undefined {
  if (internal == null) return undefined
  const value = Math.min(100, Math.max(0, internal))
  // Two half-ramps meeting at white in the middle, which is what makes a
  // mid-table rating read as neutral rather than as a weak green.
  return value < 50
    ? mix(LOW, MID, value / 50)
    : mix(MID, HIGH, (value - 50) / 50)
}

/**
 * The colour for one category score: the gradient, with a flat top mark gold
 * and a flat zero crimson.
 *
 * @param internal - The score on the internal 0–100 scale, or null for none —
 * which returns `undefined` and leaves the caller's own text colour in place
 * rather than inventing one.
 */
export function scoreColor(internal: number | null): string | undefined {
  if (internal == null) return undefined
  if (internal >= 100) return BEST
  if (internal <= 0) return WORST
  return ratingRampColor(internal)
}

/**
 * The colour for an overall rating: the gradient, with the top of the ranking
 * gold and the bottom crimson.
 *
 * Position rather than value, because a weighted average only reaches a flat 10
 * or 0 if every category agrees exactly — so anchoring on the scale would leave
 * both marks essentially unused. Anchoring on the ranking spends them on the
 * two levels they mean the most for.
 *
 * @param rank - This level's 1-based position.
 * @param lastRank - The position of the lowest-rated level. A ranking of one
 * has `rank === lastRank`, and gold wins: a solitary entry is the user's best
 * before it is their worst.
 */
export function overallColor(
  internal: number | null,
  rank: number,
  lastRank: number
): string | undefined {
  if (internal == null) return undefined
  if (rank === 1) return BEST
  if (rank === lastRank) return WORST
  return ratingRampColor(internal)
}

function mix(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number
): string {
  const channel = (i: number) => Math.round(from[i]! + (to[i]! - from[i]!) * t)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}
