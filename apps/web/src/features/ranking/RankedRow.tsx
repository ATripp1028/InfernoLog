import { forwardRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DragHandle } from '@/features/settings/components/DragHandle'
import { RankingBadge } from './RankingBadge'
import { ThumbnailWash } from './ThumbnailWash'
import type { RankingItem } from './types'

interface RankedRowProps {
  rank: number
  item: RankingItem
  // Drag affordance — omitted when the list is read-only (filtered).
  handle?: React.ReactNode
  highlight?: boolean | undefined
  isDragging?: boolean
  style?: React.CSSProperties
  // Stable DOM id for handoff scroll-into-view. Omitted on the drag overlay to
  // avoid a duplicate id while a real row exists.
  domId?: string
}

// Presentational ranked row. The sortable wrapper below feeds it a ref + style.
export const RankedRow = forwardRef<HTMLDivElement, RankedRowProps>(
  ({ rank, item, handle, highlight, isDragging, style, domId }, ref) => {
    const { level, badge, hasPendingUpdate } = item
    return (
      <div
        ref={ref}
        id={domId}
        style={style}
        className={[
          'relative h-[72px] overflow-hidden rounded-card border bg-[var(--color-bg-surface)]',
          highlight
            ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
            : 'border-[var(--color-border-subtle)]',
          isDragging ? 'opacity-50' : '',
        ].join(' ')}
      >
        <ThumbnailWash levelId={level.inGameId} />
        <div className="relative z-10 flex h-full items-center gap-3 px-2">
          {handle}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-primary">
              #{rank} — {level.name ?? `Level #${level.inGameId}`}
            </div>
            <div className="truncate text-xs text-text-secondary">
              {level.creator
                ? `Published by ${level.creator}`
                : 'Unknown creator'}
            </div>
          </div>
          {hasPendingUpdate && (
            <span
              aria-label="Level data update pending"
              title="Level data update pending"
              className="size-2 shrink-0 rounded-full bg-[var(--color-accent)]"
            />
          )}
          <RankingBadge badge={badge} />
        </div>
      </div>
    )
  }
)
RankedRow.displayName = 'RankedRow'

// Sortable ranked row — used when the list is interactive (not filtered).
export function SortableRankedRow({
  rank,
  item,
  highlight,
}: {
  rank: number
  item: RankingItem
  highlight?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.levelProgressId })

  return (
    <RankedRow
      ref={setNodeRef}
      rank={rank}
      item={item}
      highlight={highlight}
      isDragging={isDragging}
      domId={`rk-${item.levelProgressId}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      handle={<DragHandle listeners={listeners} attributes={attributes} />}
    />
  )
}
