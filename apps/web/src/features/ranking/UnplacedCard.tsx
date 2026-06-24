import { forwardRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DragHandle } from '@/features/settings/components/DragHandle'
import { DifficultyFace } from '@/components/DifficultyFace'
import { formatNumber } from '@/features/logging/format'
import { RankingBadge } from './RankingBadge'
import { ThumbnailWash } from './ThumbnailWash'
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
    const { level, badge, attempts } = item
    return (
      <div
        ref={ref}
        id={domId}
        style={style}
        onClick={onClick}
        className={[
          'relative overflow-hidden rounded-card border bg-[var(--color-bg-elevated)]',
          highlight
            ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
            : 'border-[var(--color-border-subtle)]',
          isDragging ? 'opacity-50' : '',
          onClick ? 'cursor-pointer' : '',
        ].join(' ')}
      >
        <ThumbnailWash levelId={level.inGameId} variant="card" />
        <div className="relative z-10 flex items-center p-2">
          {handle}
          <DifficultyFace
            difficulty={level.inGameDifficulty}
            featured={level.featured}
            epicValue={level.epicValue}
            rated={level.isRated}
            size={90}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text-primary">
              {level.name ?? `Level #${level.inGameId}`}
            </div>
            <div className="truncate text-xs text-text-secondary">
              {level.creator ? `By ${level.creator}` : 'Unknown creator'}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {attempts != null && (
                <span
                  title="Attempts"
                  className="text-[11px] tabular-nums text-text-secondary"
                >
                  {formatNumber(attempts)} att
                </span>
              )}
              {badge ? (
                <RankingBadge badge={badge} />
              ) : (
                <span className="text-[11px] text-text-secondary">
                  No list reference
                </span>
              )}
            </div>
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
