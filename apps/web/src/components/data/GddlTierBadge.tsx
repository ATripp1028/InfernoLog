import { gddlTierColor } from '@/lib/tierColor'

/**
 * How the badge sizes itself and what it does with a missing tier.
 *
 * `cell` is the table treatment: a fixed box so a column of them lines up, with
 * an em dash standing in for a level that has no GDDL reference logged — the
 * cell still has to occupy its slot. `inline` hugs its content and renders
 * nothing at all when the tier is absent, because it sits inside a row of
 * badges where a placeholder would read as real data.
 */
export type GddlTierBadgeVariant = 'cell' | 'inline'

/**
 * A level's GDDL tier, coloured along the difficulty gradient.
 *
 * @param tier - The GDDL tier, or null when none is logged. See
 * {@link GddlTierBadgeVariant} for what each variant does with null.
 */
export function GddlTierBadge({
  tier,
  variant = 'cell',
}: {
  tier: number | null
  variant?: GddlTierBadgeVariant
}) {
  if (tier == null) {
    if (variant === 'inline') return null
    return (
      <div className="flex h-[26px] w-9 items-center justify-center rounded bg-bg-subtle text-[13px] font-bold text-text-secondary">
        —
      </div>
    )
  }

  // Low tiers (1–15) use light backgrounds, so their number reads black; the
  // palette only darkens from tier 16 up.
  const style = {
    backgroundColor: gddlTierColor(tier),
    color: tier <= 15 ? '#0d0d0d' : '#f5f5f5',
  }

  // Each variant keeps the element it had before they were merged: the cell is
  // a block in a table row, the inline one sits in a line of text.
  return variant === 'cell' ? (
    <div
      className="flex h-[26px] w-9 items-center justify-center rounded text-[13px] font-bold"
      style={style}
    >
      {tier}
    </div>
  ) : (
    <span className="rounded px-2 py-1 text-xs font-bold" style={style}>
      {tier}
    </span>
  )
}
