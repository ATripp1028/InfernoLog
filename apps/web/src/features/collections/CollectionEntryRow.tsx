// Member rows on the collection detail page. An ordered collection's row has a
// drag handle and its position — `SortableRow` in the list, `Row` bare inside
// the DragOverlay and while a search has dragging off. An unordered
// collection's `UnorderedRow` has neither, and shows the figures the list is
// sorted and filtered by. All three share one frame: thumbnail wash,
// difficulty face, name and creator, remove button — and, like a /search
// result, the row opens the level's Global Level Page, with the same hover
// glow.

import type { ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Loader2, X } from 'lucide-react'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { CopyableId } from '@/components/data/CopyableId'
import { RowHoverGlow } from '@/components/data/RowHoverGlow'
import { RowStatChip } from '@/components/data/RowStatChip'
import { ThumbnailWash } from '@/components/data/ThumbnailWash'
import { backOriginState } from '@/lib/backOrigin'
import type {
  CollectionBrowseRow,
  CollectionEntry,
} from '@/lib/api/collections'
import { ROW_CONTROL, ROW_LINK_STRETCH } from '@/lib/rowLink'
import { rowStats, type RowStatKey } from '@/lib/rowStats'
import { cn } from '@/lib/utils'

// What the frame reads off a level — an entry's level and a browse row both
// carry it.
interface RowLevel {
  inGameId: string
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
}

// The link wraps the level's NAME and stretches over the row (lib/rowLink), so
// the row's own controls — drag handle, id copy, remove — are its siblings
// rather than buttons nested in an <a>. The DragOverlay copy (`overlay`) has
// no link at all, so a drop can never be read as a click.
function RowFrame({
  level,
  handle,
  leading,
  below,
  trailing,
  removing = false,
  onRemove,
  overlay = false,
}: {
  level: RowLevel
  /** First in the row — the ordered row's drag handle. */
  handle?: ReactNode
  /** Before the face — the ordered row's position. */
  leading?: ReactNode
  /** Under the name and creator. */
  below?: ReactNode
  /** After the name block. */
  trailing?: ReactNode
  removing?: boolean | undefined
  onRemove?: (() => void) | undefined
  overlay?: boolean
}) {
  const location = useLocation()
  const name = level.name ?? `Level #${level.inGameId}`
  const nameClass = 'truncate text-sm font-semibold text-text-primary'

  return (
    <div
      className={[
        'group relative h-[72px] overflow-hidden rounded-card border border-border-subtle bg-bg-surface',
        overlay ? 'shadow-[0_8px_24px_rgba(0,0,0,0.6)]' : '',
      ].join(' ')}
    >
      <ThumbnailWash levelId={level.inGameId} />
      {/* White: this row opens the level's Global Level Page, as a /search
          result does. */}
      <RowHoverGlow variant="global" />
      {/* The one `relative` the stretched link measures itself against. */}
      <div className="relative z-10 flex h-full items-center gap-3 pl-2 pr-3 md:pr-4">
        {handle}
        {leading}
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={80}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-2">
            {overlay ? (
              <span className={nameClass}>{name}</span>
            ) : (
              <Link
                to="/levels/$levelId"
                params={{ levelId: level.inGameId }}
                state={backOriginState(location.href)}
                className={cn(
                  nameClass,
                  ROW_LINK_STRETCH,
                  'rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                )}
              >
                {name}
              </Link>
            )}
            <CopyableId
              id={level.inGameId}
              label="Level ID"
              className={cn(ROW_CONTROL, 'shrink-0 px-1.5 py-0.5 text-[10px]')}
            />
          </p>
          <p className="truncate text-xs text-text-secondary">
            {level.creator
              ? `Published by ${level.creator}`
              : 'Unknown creator'}
          </p>
          {below}
        </div>
        {trailing}
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${level.name ?? 'level'} from collection`}
            onClick={onRemove}
            disabled={removing}
            className={cn(
              ROW_CONTROL,
              'flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60'
            )}
          >
            {removing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Draggable entry row, for an ordered collection's list.
 */
export function SortableRow({
  position,
  entry,
  dimmed,
  removing,
  onRemove,
}: {
  position: number
  entry: CollectionEntry
  dimmed: boolean
  removing: boolean
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
      }}
      className={dimmed ? 'opacity-40' : undefined}
    >
      <Row
        position={position}
        entry={entry}
        removing={removing}
        onRemove={onRemove}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}

/**
 * An ordered collection's entry row: handle and position. The sortable
 * wrapper above feeds it drag props; with `reorderable` off (a search is
 * narrowing the list) the handle is left out but its space kept, so positions
 * stay aligned.
 */
export function Row({
  position,
  entry,
  removing = false,
  onRemove,
  handleProps,
  reorderable = true,
  overlay = false,
}: {
  position: number
  entry: CollectionEntry
  removing?: boolean
  onRemove?: () => void
  handleProps?: Record<string, unknown>
  reorderable?: boolean
  overlay?: boolean
}) {
  const { level } = entry
  return (
    <RowFrame
      level={level}
      removing={removing}
      onRemove={onRemove}
      overlay={overlay}
      handle={
        reorderable ? (
          <button
            type="button"
            aria-label={`Reorder ${level.name ?? 'level'}`}
            className="relative z-10 flex h-full w-5 shrink-0 cursor-grab touch-none items-center justify-center text-text-tertiary active:cursor-grabbing"
            {...handleProps}
          >
            <GripVertical size={16} />
          </button>
        ) : (
          <span aria-hidden className="w-5 shrink-0" />
        )
      }
      leading={
        <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-text-secondary">
          {position}
        </span>
      }
    />
  )
}

/**
 * An unordered collection's row: no handle or position, and the figures the
 * list is sorted and filtered by (see lib/rowStats) — beside the name on wider
 * screens, under it on mobile.
 */
export function UnorderedRow({
  level,
  statKeys,
  removing,
  onRemove,
}: {
  level: CollectionBrowseRow
  statKeys: RowStatKey[]
  removing: boolean
  onRemove: () => void
}) {
  const stats = rowStats(level, statKeys)
  return (
    <RowFrame
      level={level}
      removing={removing}
      onRemove={onRemove}
      below={
        stats.length > 0 && (
          <span className="mt-1 flex items-center gap-x-3 overflow-hidden whitespace-nowrap text-xs sm:hidden">
            {stats.map((stat) => (
              <RowStatChip key={stat.key} stat={stat} />
            ))}
          </span>
        )
      }
      trailing={
        stats.length > 0 && (
          <span className="hidden max-w-[55%] shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs sm:flex">
            {stats.map((stat) => (
              <RowStatChip key={stat.key} stat={stat} />
            ))}
          </span>
        )
      }
    />
  )
}
