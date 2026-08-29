// Name-text color for the top of any personally ranked list — the demon list
// (hardest first) and the Ranking page (best-rated first) both use it, so the
// two read as the same kind of list. Gold, silver, bronze, then a cool azure
// for 4th–5th (distinct from the warm medals so they read as the next tier).
// Ranks past 5 use the default text color.
const MEDAL_COLORS: Record<number, string> = {
  1: '#ffd43b', // gold — your hardest
  2: '#c7ccd1', // silver
  3: '#cd7f32', // bronze
  4: '#8ec5ff', // azure
  5: '#8ec5ff', // azure
}

/**
 * The medal color for a rank, or `null` past the podium.
 */
export function medalColor(rank: number): string | undefined {
  return MEDAL_COLORS[rank]
}
