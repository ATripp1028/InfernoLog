// Name-text color for the top of a personally ranked list: gold, silver,
// bronze, then a cool azure for 4th–5th (distinct from the warm medals so they
// read as the next tier). Ranks past 5 use the default text color.
//
// In lib/ rather than in the demon list because rank-tinting is a general
// treatment, but the demon list is currently its only caller — the Ranking page
// deliberately tints by rating value instead (see lib/ratingColor), since its
// rank is already spelled out as a number.
const MEDAL_COLORS: Record<number, string> = {
  1: '#ffd43b', // gold — your hardest
  2: '#c7ccd1', // silver
  3: '#cd7f32', // bronze
  4: '#8ec5ff', // azure
  5: '#8ec5ff', // azure
}

/**
 * The medal color for a rank, or `undefined` past 5th — which leaves the
 * caller's own text color in place rather than overriding it.
 */
export function medalColor(rank: number): string | undefined {
  return MEDAL_COLORS[rank]
}
