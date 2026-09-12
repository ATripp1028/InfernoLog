import { TierChip } from '@/components/data/TierChip'
import type { RowStat } from '@/lib/rowStats'

/**
 * A figure a level row surfaces because the list is sorted or filtered by it
 * (see lib/rowStats): a community-list placement as the shared {@link TierChip},
 * or a labelled value. Unknown values show a dash, since under a sort by them
 * that blank is why the row sits where it does. Shared by the /search results
 * and unordered collections.
 */
export function RowStatChip({ stat }: { stat: RowStat }) {
  if (stat.kind === 'tier') return <TierChip chip={stat.chip} />

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
