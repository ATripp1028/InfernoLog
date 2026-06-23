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
  // Low tiers (1–15) use light backgrounds, so their number reads black; the
  // palette only darkens from tier 16 up.
  return (
    <div
      className="flex h-[26px] w-9 items-center justify-center rounded text-[13px] font-bold"
      style={{
        backgroundColor: gddlTierColor(tier),
        color: tier <= 15 ? '#0d0d0d' : '#f5f5f5',
      }}
    >
      {tier}
    </div>
  )
}
