import { SheetSourceChip, TierBadge } from '@/components/data/TierBadge'
import { cn } from '@/lib/utils'
import type { CommunityTierChip } from '@/lib/communityTiers'

/**
 * A level's placement on one community list, as a row chip: the list's favicon,
 * the painted badge, and — for the spreadsheets — which of the two it came
 * from. What each list puts in the badge is lib/tierBadges; which chips a level
 * gets is lib/communityTiers.
 *
 * The icon carries the list's identity, so the chip's accessible name is the
 * label, read out before the badge rather than shown beside it — the row has
 * no space for "GDDL tier" in words, and the favicon is what a reader
 * recognises anyway.
 *
 * One component for every surface that shows a placement in a row: the /search
 * results, an unordered collection's rows, and the demon list. Their rows
 * differ in what they link to, not in how a tier looks.
 */
export function TierChip({
  chip,
  className,
}: {
  chip: Pick<CommunityTierChip, 'label' | 'icon' | 'look' | 'source'>
  className?: string
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={chip.label}
    >
      <img
        src={chip.icon}
        alt=""
        aria-hidden
        className="size-3.5 shrink-0 object-contain"
      />
      <span className="sr-only">{chip.label}:</span>
      <TierBadge
        look={chip.look}
        className="min-w-0 px-1.5 py-0.5 text-[11px]"
      />
      {chip.source && <SheetSourceChip source={chip.source} />}
    </span>
  )
}

/**
 * Every community-list placement a level holds, or `fallback` when it holds
 * none. Wraps rather than scrolls: a row that is too narrow for three chips
 * should grow, not clip a placement away.
 */
export function TierChips({
  chips,
  className,
  fallback = null,
}: {
  chips: Pick<CommunityTierChip, 'key' | 'label' | 'icon' | 'look' | 'source'>[]
  className?: string
  /** Shown in place of the chips when the level is on none of the lists. */
  fallback?: React.ReactNode
}) {
  if (chips.length === 0) return <>{fallback}</>
  return (
    <span
      className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', className)}
    >
      {chips.map((chip) => (
        <TierChip key={chip.key} chip={chip} />
      ))}
    </span>
  )
}
