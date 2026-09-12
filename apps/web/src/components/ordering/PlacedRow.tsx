import { forwardRef } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X } from 'lucide-react'
import { DragHandle } from '@/components/generic/drag-handle'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { formatNumber } from '@/lib/numberFormat'
import { backOriginState } from '@/lib/backOrigin'
import { CopyableId } from '@/components/data/CopyableId'
import { RowHoverGlow } from '@/components/data/RowHoverGlow'
import { TierChips } from '@/components/data/TierChip'
import { ThumbnailWash } from '@/components/data/ThumbnailWash'
import { communityTierChips } from '@/lib/communityTiers'
import { medalColor } from '@/lib/medals'
import { ROW_CONTROL, ROW_LINK_STRETCH } from '@/lib/rowLink'
import { cn } from '@/lib/utils'
import type { OrderedItem } from '@/lib/ordering/types'

interface PlacedRowProps {
  rank: number
  item: OrderedItem
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
  /**
   * What this ordering is called, for the remove control's label — "demon
   * list" or "ranking". The rest of the row is identical either way.
   */
  listLabel: string
}

/**
 * Presentational ranked row. The sortable wrapper below feeds it a ref + style.
 */
export const PlacedRow = forwardRef<HTMLDivElement, PlacedRowProps>(
  (
    {
      rank,
      item,
      handle,
      highlight,
      isDragging,
      style,
      domId,
      onRemove,
      listLabel,
    },
    ref
  ) => {
    const { level, communityTiers, attempts } = item
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
        {/* The one `relative` the stretched link measures itself against. */}
        <div className="relative z-10 flex h-full items-center gap-3 px-2">
          {handle}
          <DifficultyFace
            difficulty={level.inGameDifficulty}
            featured={level.featured}
            epicValue={level.epicValue}
            rated={level.isRated}
            size={80}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                to="/log/$levelId"
                params={{ levelId: level.inGameId }}
                state={backOriginState(location.href)}
                className={cn(
                  'truncate text-sm font-semibold text-text-primary',
                  ROW_LINK_STRETCH
                )}
                style={{ color: medalColor(rank) }}
                onClick={(e) => e.stopPropagation()}
              >
                #{rank} — {level.name ?? `Level #${level.inGameId}`}
              </Link>
              <CopyableId
                id={level.inGameId}
                label="Level ID"
                className={cn(
                  ROW_CONTROL,
                  'shrink-0 px-1.5 py-0.5 text-[10px]'
                )}
              />
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
          <TierChips
            chips={communityTierChips(communityTiers)}
            className="shrink-0 justify-end"
          />
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${level.name ?? 'level'} from your ${listLabel}`}
              title={`Remove from your ${listLabel}`}
              onClick={onRemove}
              className={cn(
                ROW_CONTROL,
                'flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary'
              )}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {/* Gold: this row opens the viewer's own page for the level. */}
        <RowHoverGlow variant="progress" />
      </div>
    )
  }
)
PlacedRow.displayName = 'PlacedRow'

/**
 * Sortable ranked row — used when the list is interactive (not filtered).
 */
export function SortablePlacedRow({
  rank,
  item,
  highlight,
  onRemove,
  listLabel,
}: {
  rank: number
  item: OrderedItem
  highlight?: boolean
  onRemove?: (() => void) | undefined
  /**
   * What this ordering is called, for the remove control's label — "demon
   * list" or "ranking". The rest of the row is identical either way.
   */
  listLabel: string
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
    <PlacedRow
      ref={setNodeRef}
      rank={rank}
      item={item}
      highlight={highlight}
      isDragging={isDragging}
      onRemove={onRemove}
      listLabel={listLabel}
      domId={`rk-${item.levelProgressId}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
      }}
      handle={
        <DragHandle
          listeners={listeners}
          attributes={attributes}
          className={ROW_CONTROL}
        />
      }
    />
  )
}
