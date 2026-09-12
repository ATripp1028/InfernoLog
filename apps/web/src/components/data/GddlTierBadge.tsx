import { gddlTierColor } from '@/lib/tierColor'
import { gddlTierTextColor } from '@/lib/tierBadges'

/**
 * A level's GDDL tier as a table cell, coloured along the difficulty gradient.
 *
 * Fixed-size so a column of them lines up, with an em dash standing in for a
 * level that has no GDDL reference logged — the cell still has to occupy its
 * slot. That makes it The List's treatment specifically; a tier shown inside a
 * row of other chips is `TierChip`, which hugs its content, carries the list's
 * icon, and renders nothing at all when the level has no placement.
 *
 * @param tier - The GDDL tier, or null when none is logged.
 */
export function GddlTierBadge({ tier }: { tier: number | null }) {
  if (tier == null) {
    return (
      <div className="flex h-[26px] w-9 items-center justify-center rounded bg-bg-subtle text-[13px] font-bold text-text-secondary">
        —
      </div>
    )
  }

  return (
    <div
      className="flex h-[26px] w-9 items-center justify-center rounded text-[13px] font-bold"
      style={{
        backgroundColor: gddlTierColor(tier),
        color: gddlTierTextColor(tier),
      }}
    >
      {tier}
    </div>
  )
}
