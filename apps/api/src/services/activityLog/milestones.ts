// Top-N milestone crossings on the classic ranking.
//
// A crossing is a property of ONE level on ONE ranking event, so it is a field
// on that level's ActivityLogLevelImpact row rather than an event of its own —
// see docs/RANKING_SYSTEM.md. A single move can produce a crossing for the
// mover and for a neighbour it pushed over a boundary; each is recorded on its
// own impact row.
//
// The thresholds live here, not in the database, because no milestone-threshold
// model exists to point at. If they ever become per-user configuration, this is
// the one place that has to learn about it — `milestoneCrossed` is an int
// column precisely so that change needs no migration.

/**
 * Top-N boundaries a level can cross, ascending.
 *
 * A level is "inside" threshold N when its 1-based position is `<= N` (#1 is
 * the hardest). Unranked counts as outside every threshold.
 */
export const MILESTONE_THRESHOLDS: readonly number[] = [1, 5, 10, 25, 50, 100]

function isInside(position: number | null, threshold: number): boolean {
  return position !== null && position <= threshold
}

/**
 * The tightest top-N boundary this level crossed, or `null` if it crossed none.
 *
 * Direction is deliberately NOT encoded: entering the top 10 and dropping out
 * of it both return `10`. The reader tells them apart from the same
 * `positionBefore`/`positionAfter` pair this was computed from, which the impact
 * row stores anyway — encoding it twice would just be a second thing to keep
 * consistent.
 *
 * The tightest boundary wins because it is the only one worth saying: a jump
 * from #30 to #4 crosses 25, 10 and 5, and "reached the top 5" already implies
 * the rest.
 *
 * @param positionBefore - 1-based position before the event; `null` when the
 * level was not in the ranking (an initial placement), which reads as outside
 * every threshold — so debuting at #3 crosses 5.
 * @param positionAfter - 1-based position after the event; `null` when the
 * level left the ranking.
 */
export function milestoneCrossed(
  positionBefore: number | null,
  positionAfter: number | null
): number | null {
  for (const threshold of MILESTONE_THRESHOLDS) {
    if (
      isInside(positionBefore, threshold) !== isInside(positionAfter, threshold)
    ) {
      return threshold
    }
  }
  return null
}
