// The canonical rating order: how a user's levels line up when sorted by how
// good they are. Shared by apps/api (the `rating_rank` field change on a
// LOG_EDIT) and apps/web (the Ranking page's row numbers, and the Log page's
// rating sort) so a position quoted in one place means the same thing in the
// others — "Up 43 in your ranking" in the Events feed has to name the position
// the Ranking page actually shows.
//
// The order is total. That matters more here than it looks: `rating_rank` is
// the one figure in the whole event log that cannot be recomputed afterwards
// (it depends on every OTHER level's rating at that instant, and nothing
// records those), so an order that left ties unresolved would make a logged
// rank depend on the row order Postgres happened to return.
//
// A ranked position is only comparable inside one rating-config era. A weight
// change reshuffles every level's average and is deliberately not logged, so a
// rank recorded before a reweight was measured on a scale that no longer
// applies. See docs/RATING_SYSTEM.md and docs/EVENT_LOG.md.

/**
 * One level's inputs to the rating order.
 *
 * `enjoyment` and `dateMs` come from the level's **representative** progress
 * update — the completion when there is one, else the most recently logged
 * update. That is the same update `GET /v1/me/progress` folds into a list row,
 * which is what lets the client and the server rank from the same numbers.
 */
export interface RatingOrderItem {
  /** The GD level id. The final tiebreak, and always unique per user. */
  levelId: string
  /** The computed overall rating (see `computeOverallRating`), or null. */
  overallRating: number | null
  /** The representative update's enjoyment, or null. */
  enjoyment: number | null
  /**
   * The representative update's date as epoch milliseconds, or null. Epoch ms
   * rather than a Date so the server's Date and the client's deserialized wire
   * value compare identically.
   */
  dateMs: number | null
}

/**
 * Compares two levels in the canonical rating order — best first.
 *
 * The chain, in order:
 *
 * 1. **Overall rating**, highest first. The whole point of the order.
 * 2. **Enjoyment**, highest first. A separate signal from the rating (it is
 *    logged per event and excluded from the average unless the user opts in),
 *    so it breaks a genuine tie rather than restating the first key.
 * 3. **Date**, earliest first — a long-standing rating outranks one just added.
 * 4. **Level id**, ascending. Arbitrary but total, and it is the number a user
 *    recognises.
 *
 * A missing value always sorts last within its own key, so an unrated or
 * undated level never displaces one that has the value.
 *
 * @returns Negative when `a` ranks above `b`, positive when below, 0 only when
 * the two are the same level.
 */
export function compareRatingOrder(
  a: RatingOrderItem,
  b: RatingOrderItem
): number {
  const byRating = descNullsLast(a.overallRating, b.overallRating)
  if (byRating !== 0) return byRating
  const byEnjoyment = descNullsLast(a.enjoyment, b.enjoyment)
  if (byEnjoyment !== 0) return byEnjoyment
  const byDate = ascNullsLast(a.dateMs, b.dateMs)
  if (byDate !== 0) return byDate
  return a.levelId < b.levelId ? -1 : a.levelId > b.levelId ? 1 : 0
}

/**
 * Sorts a copy of `items` into the canonical rating order and assigns 1-based
 * positions.
 *
 * Unrated levels sort to the tail and hold no position at all — they are
 * returned with a null `rank` rather than being dropped, because a caller
 * showing every logged level still has to render them somewhere.
 *
 * @returns The items in order, each paired with its rank.
 */
export function rankByRatingOrder<T extends RatingOrderItem>(
  items: readonly T[]
): { item: T; rank: number | null }[] {
  const ordered = [...items].sort(compareRatingOrder)

  let rank = 0
  return ordered.map((item) => {
    // The counter only advances while ratings are still present, so the first
    // unrated level does not inherit the position after the last rated one.
    if (item.overallRating !== null) rank += 1
    return { item, rank: item.overallRating === null ? null : rank }
  })
}

function descNullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return b - a
}

function ascNullsLast(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}
