// A member row on the collection detail page: drag handle, position, level
// identity and the per-row remove button. `SortableRow` is the in-list
// variant; `Row` is also rendered bare inside the DragOverlay.

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Loader2, X } from 'lucide-react'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { GddlTierBadge } from '@/components/data/GddlTierBadge'
import { ThumbnailWash } from '@/components/data/ThumbnailWash'
import type { CollectionEntry } from '@/lib/api/collections'

/**
 * Draggable entry row, for the reorderable custom-collection view.
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
 * Presentational entry row. The sortable wrapper below feeds it a ref and drag style.
 */
export function Row({
  position,
  entry,
  removing = false,
  onRemove,
  handleProps,
  overlay = false,
}: {
  position: number
  entry: CollectionEntry
  removing?: boolean
  onRemove?: () => void
  handleProps?: Record<string, unknown>
  overlay?: boolean
}) {
  const { level } = entry
  return (
    <div
      className={[
        'relative h-[72px] overflow-hidden rounded-card border border-border-subtle bg-bg-surface',
        overlay ? 'shadow-[0_8px_24px_rgba(0,0,0,0.6)]' : '',
      ].join(' ')}
    >
      <ThumbnailWash levelId={level.inGameId} />
      <div className="relative z-10 flex h-full items-center gap-3 pl-2 pr-3 md:pr-4">
        <button
          type="button"
          aria-label={`Reorder ${level.name ?? 'level'}`}
          className="flex h-full w-5 shrink-0 cursor-grab touch-none items-center justify-center text-text-tertiary active:cursor-grabbing"
          {...handleProps}
        >
          <GripVertical size={16} />
        </button>
        <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-text-secondary">
          {position}
        </span>
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={80}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">
            {level.name ?? `Level #${level.inGameId}`}
          </p>
          <p className="truncate text-xs text-text-secondary">
            {level.creator
              ? `Published by ${level.creator}`
              : 'Unknown creator'}
          </p>
        </div>
        <GddlTierBadge tier={entry.badge?.gddlTier ?? null} variant="inline" />
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${level.name ?? 'level'} from collection`}
            onClick={onRemove}
            disabled={removing}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-subtle hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
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
