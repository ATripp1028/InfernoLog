import type { RankingBadge as RankingBadgeData } from '@infernolog/core'
import { gddlTierColor } from '@/features/list/tierColor'

// The single list-reference badge on a ranked row (GDDL tier or AREDL rank).
// Renders nothing when the completion has no GDDL/AREDL reference — call sites
// supply their own "no reference" affordance where one is wanted.
export function RankingBadge({ badge }: { badge: RankingBadgeData }) {
  if (!badge) return null

  if (badge.listSource === 'GDDL') {
    const tier = Number(badge.tierOrRank)
    const colored = Number.isFinite(tier)
    return (
      <span
        className="rounded px-2 py-1 text-xs font-bold"
        style={
          colored
            ? {
                backgroundColor: gddlTierColor(tier),
                // Low tiers use light backgrounds → dark text reads better.
                color: tier <= 15 ? '#0d0d0d' : '#f5f5f5',
              }
            : undefined
        }
      >
        {badge.tierOrRank}
      </span>
    )
  }

  // AREDL — an exact rank; neutral styling.
  return (
    <span className="rounded bg-[var(--color-bg-subtle)] px-2 py-1 text-xs font-bold text-text-primary">
      AREDL #{badge.tierOrRank}
    </span>
  )
}
