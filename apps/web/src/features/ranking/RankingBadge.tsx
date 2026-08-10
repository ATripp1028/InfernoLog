import type { RankingBadge as RankingBadgeData } from '@infernolog/core'
import { gddlTierColor } from '@/features/list/tierColor'

/**
 * The GDDL tier badge on a ranking row, or nothing when the user has logged no tier for the level.
 */
export function RankingBadge({ badge }: { badge: RankingBadgeData }) {
  if (!badge) return null

  const tier = badge.gddlTier
  return (
    <span
      className="rounded px-2 py-1 text-xs font-bold"
      style={{
        backgroundColor: gddlTierColor(tier),
        color: tier <= 15 ? '#0d0d0d' : '#f5f5f5',
      }}
    >
      {tier}
    </span>
  )
}
