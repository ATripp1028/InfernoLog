import { forwardRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { DragHandle } from '@/features/settings/components/DragHandle'
import { RankingBadge } from './RankingBadge'
import type { RankingItem } from './types'

interface UnplacedCardProps {
  item: RankingItem
  handle?: React.ReactNode
  highlight?: boolean | undefined
  isDragging?: boolean
  style?: React.CSSProperties
  // Tap-to-place affordance (mobile, where there's no drag).
  onClick?: () => void
  // Stable DOM id for handoff scroll-into-view (omitted on the drag overlay).
  domId?: string
}

// Presentational unplaced card. Compact: handle, small thumb, name/creator, and
// the list-reference tag (or "No list reference").
export const UnplacedCard = forwardRef<HTMLDivElement, UnplacedCardProps>(
  ({ item, handle, highlight, isDragging, style, onClick, domId }, ref) => {
    const { level, badge } = item
    return (
      <div
        ref={ref}
        id={domId}
        style={style}
        onClick={onClick}
        className={[
          'flex items-center gap-2 rounded-card border bg-[var(--color-bg-elevated)] p-2',
          highlight
            ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
            : 'border-[var(--color-border-subtle)]',
          isDragging ? 'opacity-50' : '',
          onClick ? 'cursor-pointer' : '',
        ].join(' ')}
      >
        {handle}
        <div className="relative h-8 w-12 shrink-0 overflow-hidden rounded bg-[var(--color-bg-subtle)]">
          <img
            src={levelThumbnailUrl(level.inGameId)}
            alt=""
            aria-hidden
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
            className="size-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">
            {level.name ?? `Level #${level.inGameId}`}
          </div>
          <div className="truncate text-xs text-text-tertiary">
            {level.creator ? `By ${level.creator}` : 'Unknown creator'}
          </div>
          <div className="mt-1">
            {badge ? (
              <RankingBadge badge={badge} />
            ) : (
              <span className="text-[11px] text-text-tertiary">
                No list reference
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }
)
UnplacedCard.displayName = 'UnplacedCard'

// Sortable/draggable unplaced card — the source for cross-list placement.
export function SortableUnplacedCard({
  item,
  highlight,
}: {
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
    <UnplacedCard
      ref={setNodeRef}
      item={item}
      highlight={highlight}
      isDragging={isDragging}
      domId={`rk-${item.levelProgressId}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      handle={<DragHandle listeners={listeners} attributes={attributes} />}
    />
  )
}
