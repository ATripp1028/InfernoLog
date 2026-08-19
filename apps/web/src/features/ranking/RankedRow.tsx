import { forwardRef } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X } from 'lucide-react'
import { DragHandle } from '@/features/settings/components/DragHandle'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { formatNumber } from '@/features/logging/format'
import { backOriginState } from '@/lib/backOrigin'
import { RankingBadge } from './RankingBadge'
import { ThumbnailWash } from './ThumbnailWash'
import { medalColor } from './medals'
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
  // Unplace affordance — omitted on the drag overlay, where a click target
  // sitting under the cursor would be nonsense.
  onRemove?: (() => void) | undefined
}

/**
 * Presentational ranked row. The sortable wrapper below feeds it a ref + style.
 */
export const RankedRow = forwardRef<HTMLDivElement, RankedRowProps>(
  (
    { rank, item, handle, highlight, isDragging, style, domId, onRemove },
    ref
  ) => {
    const { level, badge, attempts } = item
    const location = useLocation()
    return (
      <div
        ref={ref}
        id={domId}
        style={style}
        className={[
          'group relative h-[72px] overflow-hidden rounded-card border bg-bg-surface',
          highlight
            ? 'border-primary ring-1 ring-primary'
            : 'border-border-subtle',
          isDragging ? 'opacity-50' : '',
        ].join(' ')}
      >
        <ThumbnailWash levelId={level.inGameId} />
        <div className="relative z-10 flex h-full items-center gap-3 px-2">
          {handle}
          <Link
            to="/list/$levelId"
            params={{ levelId: level.inGameId }}
            state={backOriginState(location.href)}
            className="flex min-w-0 flex-1 items-center gap-3 self-stretch"
            onClick={(e) => e.stopPropagation()}
          >
            <DifficultyFace
              difficulty={level.inGameDifficulty}
              featured={level.featured}
              epicValue={level.epicValue}
              rated={level.isRated}
              size={80}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-semibold text-text-primary"
                style={{ color: medalColor(rank) }}
              >
                #{rank} — {level.name ?? `Level #${level.inGameId}`}
              </div>
              <div className="truncate text-xs text-text-secondary">
                {level.creator
                  ? `Published by ${level.creator}`
                  : 'Unknown creator'}
              </div>
            </div>
            {attempts != null && (
              <span
                title="Attempts"
                className="shrink-0 text-xs tabular-nums text-text-secondary"
              >
                {formatNumber(attempts)} att
              </span>
            )}
            <RankingBadge badge={badge} />
          </Link>
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${level.name ?? 'level'} from ranking`}
              title="Remove from ranking"
              onClick={onRemove}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity group-hover:opacity-100"
          style={{ boxShadow: 'inset 0 0 40px rgba(255, 159, 28, 0.22)' }}
        />
      </div>
    )
  }
)
RankedRow.displayName = 'RankedRow'

/**
 * Sortable ranked row — used when the list is interactive (not filtered).
 */
export function SortableRankedRow({
  rank,
  item,
  highlight,
  onRemove,
}: {
  rank: number
  item: RankingItem
  highlight?: boolean
  onRemove?: (() => void) | undefined
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
      onRemove={onRemove}
      domId={`rk-${item.levelProgressId}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
      }}
      handle={<DragHandle listeners={listeners} attributes={attributes} />}
    />
  )
}
