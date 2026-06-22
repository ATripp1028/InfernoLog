import { gddlTierColor } from './tierColor'

// GDDL tier badge. Color tracks the difficulty gradient; "—" when the level has
// no GDDL reference logged.
export function TierBadge({ tier }: { tier: number | null }) {
  if (tier == null) {
    return (
      <div className="flex h-[26px] w-9 items-center justify-center rounded bg-[var(--color-bg-subtle)] text-[13px] font-bold text-text-secondary">
        —
      </div>
    )
  }
  return (
    <div
      className="flex h-[26px] w-9 items-center justify-center rounded text-[13px] font-bold text-white"
      style={{ backgroundColor: gddlTierColor(tier) }}
    >
      {tier}
    </div>
  )
}
