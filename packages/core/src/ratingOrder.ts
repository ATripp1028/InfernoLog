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
// A ranked position is only comparable inside one rating-config era. Weights,
// category priority and the set of categories all feed this order, and a change
// to any of them reshuffles it — which is why a rank recorded before a config
// change was measured on a scale that no longer applies. See
// docs/RATING_SYSTEM.md and docs/EVENT_LOG.md.

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
  /** Per-category scores. Only consulted in WEIGHTED mode — see the factory. */
  ratingScores: readonly { categoryId: string; score: number }[]
}

/**
 * A weighted-mode rating category, for the priority tiebreak.
 *
 * `sortOrder` is the user's own priority ordering — the drag order in the
 * rating config editor, where the top item is highest priority. Lower sorts
 * first.
 */
export interface RatingOrderCategory {
  id: string
  sortOrder: number
}

/**
 * Builds the canonical rating comparator — best first.
 *
 * The chain, in order:
 *
 * 1. **Overall rating**, highest first. The whole point of the order.
 * 2. **Category scores**, highest first, each category taken in the user's
 *    priority order. This is the long-standing convention for weighted
 *    ratings: two levels that average out the same are separated by the
 *    category the user cares most about, not left in arbitrary order.
 * 3. **Enjoyment**, highest first. A separate signal from the rating (it is
 *    logged per event and excluded from the average unless the user opts in),
 *    so it breaks a genuine tie rather than restating the first key.
 * 4. **Date**, earliest first — a long-standing rating outranks one just added.
 * 5. **Level id**, ascending. Arbitrary but total, and it is the number a user
 *    recognises.
 *
 * A missing value always sorts last within its own link, so an unrated or
 * undated level, or one with no score in a given category, never displaces one
 * that has the value.
 *
 * @param categories - The user's rating categories, in any order; this sorts
 * them by priority once, rather than per comparison. Pass none (the default) in
 * SIMPLE mode, where per-category scores may still exist as preserved data but
 * carry no meaning — step 2 then drops out and the chain runs 1, 3, 4, 5.
 * @returns A comparator returning negative when `a` ranks above `b`, positive
 * when below, and 0 only when the two are the same level.
 */
export function ratingOrderComparator(
  categories: readonly RatingOrderCategory[] = []
): (a: RatingOrderItem, b: RatingOrderItem) => number {
  // Sorted once here rather than inside the comparator, which a sort of n rows
  // calls O(n log n) times.
  const byPriority = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

  return function compareRatingOrder(a, b) {
    const byRating = descNullsLast(a.overallRating, b.overallRating)
    if (byRating !== 0) return byRating

    for (const category of byPriority) {
      const cmp = descNullsLast(
        scoreFor(a, category.id),
        scoreFor(b, category.id)
      )
      if (cmp !== 0) return cmp
    }

    const byEnjoyment = descNullsLast(a.enjoyment, b.enjoyment)
    if (byEnjoyment !== 0) return byEnjoyment
    const byDate = ascNullsLast(a.dateMs, b.dateMs)
    if (byDate !== 0) return byDate
    return a.levelId < b.levelId ? -1 : a.levelId > b.levelId ? 1 : 0
  }
}

/**
 * Sorts a copy of `items` into the canonical rating order and assigns 1-based
 * positions.
 *
 * Unrated levels sort to the tail and hold no position at all — they are
 * returned with a null `rank` rather than being dropped, because a caller
 * showing every logged level still has to render them somewhere.
 *
 * @param categories - As {@link ratingOrderComparator}.
 * @returns The items in order, each paired with its rank.
 */
export function rankByRatingOrder<T extends RatingOrderItem>(
  items: readonly T[],
  categories: readonly RatingOrderCategory[] = []
): { item: T; rank: number | null }[] {
  const ordered = [...items].sort(ratingOrderComparator(categories))

  let rank = 0
  return ordered.map((item) => {
    // The counter only advances while ratings are still present, so the first
    // unrated level does not inherit the position after the last rated one.
    if (item.overallRating !== null) rank += 1
    return { item, rank: item.overallRating === null ? null : rank }
  })
}

function scoreFor(item: RatingOrderItem, categoryId: string): number | null {
  return item.ratingScores.find((s) => s.categoryId === categoryId)?.score ?? null
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
