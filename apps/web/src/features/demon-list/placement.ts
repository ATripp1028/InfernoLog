import type { ClassicDemonListEntry, CommunityTiers } from '@infernolog/core'

/**
 * Where to pre-scroll the ranked list when a freshly logged completion arrives
 * for placement (the "Place now" handoff). The level's community GDDL tier is
 * a *scroll hint only* — it never places the level (DEMON_LIST.md). We return
 * the index of the ranked row to bring into view.
 *
 * GDDL because it is the one list that covers every demon, so it is the tier
 * most rows actually have to compare against; a level it has not rated falls
 * back to the top. The list is hardest-first (index 0 = #1).
 */
export function preScrollIndex(
  placed: ClassicDemonListEntry[],
  tiers: CommunityTiers | null
): number {
  const target = tiers?.gddlTier
  if (target == null) return 0

  const tierOf = (e: ClassicDemonListEntry): number | null =>
    e.communityTiers.gddlTier

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
