import type { ClassicRankingEntry, RankingBadge } from '@infernolog/core'

/**
 * Where to pre-scroll the ranked list when a freshly logged completion arrives
 * for placement (the "Place now" handoff). The level's GDDL tier is a
 * *scroll hint only* — it never places the level (RANKING_SYSTEM.md). We return
 * the index of the ranked row to bring into view.
 *
 * An absent badge (no user GDDL tier opinion) falls back to the top.
 * The list is hardest-first (index 0 = #1).
 */
export function preScrollIndex(
  placed: ClassicRankingEntry[],
  badge: RankingBadge
): number {
  if (!badge) return 0
  const target = badge.gddlTier

  const tierOf = (e: ClassicRankingEntry): number | null =>
    e.badge ? e.badge.gddlTier : null

  // Highest (topmost) exact-tier match.
  const exact = placed.findIndex((e) => tierOf(e) === target)
  if (exact >= 0) return exact

  // Otherwise, just above the closest entry that's easier (lower tier).
  const under = placed.findIndex((e) => {
    const t = tierOf(e)
    return t != null && t < target
  })
  if (under >= 0) return under

  // Everything is harder (or untiered) → the bottom.
  return placed.length > 0 ? placed.length - 1 : 0
}
