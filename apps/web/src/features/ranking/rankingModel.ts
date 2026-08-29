// Pure model for the Ranking page: which of the user's levels take part in the
// rating order, and what position each one holds.
//
// The order itself is not defined here — it comes from `ratingOrderComparator`
// in @infernolog/core, the single definition shared with the Log page's rating
// sort and with the `rating_rank` the event log records. This module only
// decides who is in the running and folds the result into rows.

import {
  rankByRatingOrder,
  type LevelProgressListItem,
  type RatingOrderCategory,
} from '@infernolog/core'

/** One row of the Ranking page: a level and the position it holds. */
export interface RankedEntry {
  rank: number
  item: LevelProgressListItem
}

/** What the page renders, plus the counts its header explains itself with. */
export interface RankingModel {
  entries: RankedEntry[]
  /**
   * **Unranked** completions: ones carrying no rating of the user's own, so
   * they hold no position. Excluded from the order rather than ranked last,
   * but counted — a user who expects a level to appear needs to know why it
   * does not.
   *
   * Deliberately not "unrated", which in Geometry Dash means a level RobTop
   * has not given stars to (`level.isRated`). Such a level can be ranked here
   * perfectly well; the two senses are unrelated.
   */
  unrankedCount: number
}

/**
 * Builds the ranked list from the user's whole progress list.
 *
 * Only **completions** take part, matching the demon list's rule: a rating on
 * an in-progress level is a legitimate thing to have logged, but a ranking of
 * levels you have not finished is not the same list. Completions with no rating
 * are counted as unranked and dropped — an unranked level holds no position,
 * exactly as `rankByRatingOrder` treats it server-side.
 *
 * @param categories - The user's rating categories, for the weighted tie
 * break. Empty in SIMPLE mode.
 */
export function buildRanking(
  items: readonly LevelProgressListItem[],
  categories: readonly RatingOrderCategory[] = []
): RankingModel {
  const completions = items.filter((i) => i.status === 'COMPLETED')
  const rated = completions.filter((i) => i.overallRating != null)

  const ranked = rankByRatingOrder(
    rated.map((item) => ({
      levelId: item.level.inGameId,
      overallRating: item.overallRating ?? null,
      enjoyment: item.entry?.enjoyment ?? null,
      dateMs: dateMs(item),
      ratingScores: item.ratingScores,
      item,
    })),
    categories
  )

  return {
    entries: ranked.map(({ item, rank }) => ({
      // Every row here is rated, so rankByRatingOrder always assigns a number;
      // the null case belongs to entries this function already filtered out.
      rank: rank ?? 0,
      item: item.item,
    })),
    unrankedCount: completions.length - rated.length,
  }
}

/**
 * Narrows a ranked list to rows whose level name or id matches `query`.
 *
 * Positions are computed before filtering and travel with the row, so a
 * searched list still shows each level's real place in the whole ranking
 * rather than renumbering 1..n over the matches.
 */
export function filterRanking(
  entries: readonly RankedEntry[],
  query: string
): RankedEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...entries]
  return entries.filter(
    ({ item }) =>
      item.level.name?.toLowerCase().includes(q) ||
      item.level.inGameId.includes(q)
  )
}

function dateMs(item: LevelProgressListItem): number | null {
  const d = item.entry?.date
  if (!d) return null
  const ms = new Date(d).getTime()
  return Number.isFinite(ms) ? ms : null
}
