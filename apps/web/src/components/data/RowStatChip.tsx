import { SheetSourceChip, TierBadge } from '@/components/data/TierBadge'
import type { RowStat } from '@/lib/rowStats'

/**
 * A figure a level row surfaces because the list is sorted or filtered by it
 * (see lib/rowStats): a list placement as its painted badge beside the list's
 * icon, or a labelled value. Unknown values show a dash, since under a sort by
 * them that blank is why the row sits where it does. Shared by the /search
 * results and unordered collections.
 */
export function RowStatChip({ stat }: { stat: RowStat }) {
  if (stat.kind === 'tier') {
    return (
      <span className="inline-flex items-center gap-1.5" title={stat.label}>
        <img
          src={stat.icon}
          alt=""
          aria-hidden
          className="size-3.5 shrink-0 object-contain"
        />
        <span className="sr-only">{stat.label}:</span>
        <TierBadge
          look={stat.look}
          className="min-w-0 px-1.5 py-0.5 text-[11px]"
        />
        {stat.source && <SheetSourceChip source={stat.source} />}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1" title={stat.label}>
      <span className="text-text-tertiary">{stat.label}</span>
      <span
        className={
          stat.value === null ? 'text-text-tertiary' : 'text-text-primary'
        }
      >
        {stat.value ?? '—'}
      </span>
    </span>
  )
}
