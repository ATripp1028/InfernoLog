import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { DragHandle } from '@/components/generic/drag-handle'
import { EmptyState } from '@/components/data/EmptyState'
import { LevelIdentity } from './LevelIdentity'
import { RankedRow } from './RankedRow'
import { unrankedDragId, useManualBoard } from './useManualBoard'
import type { RankedEntry } from './rankingModel'
import type { LevelProgressListItem } from '@infernolog/core'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import type { OverallRatingConfig } from '@infernolog/core'

interface ManualRankingListProps {
  /** The WHOLE ranking — what the neighbours of a drop are computed against. */
  entries: readonly RankedEntry[]
  /** What the search and filters have left visible. */
  visible: readonly RankedEntry[]
  unranked: readonly LevelProgressListItem[]
  scale: RatingDisplayScale
  config: OverallRatingConfig
}

/**
 * The MANUAL ranking: a hand-arranged list, plus the completions waiting to
 * join it.
 *
 * MANUAL is the only mode where the order is the user's own rather than a
 * consequence of numbers they typed, so it is the only mode where the page is
 * an editor rather than a report.
 */
export function ManualRankingList({
  entries,
  visible,
  unranked,
  scale,
  config,
}: ManualRankingListProps) {
  // A drop names the rows it landed between, so those neighbours have to come
  // from the WHOLE ranking. With rows hidden by a filter the row above the gap
  // on screen is not the row above it in the list, and the write would move the
  // level somewhere the user did not point at. Reordering is therefore off
  // while the view is narrowed — the same rule the demon list follows.
  const narrowed = visible.length !== entries.length
  const {
    sensors,
    order,
    rows,
    activeItem,
    handleDragStart,
    handleDragEnd,
    clearActive,
  } = useManualBoard({ entries, unranked })

  if (narrowed) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="mb-2 text-xs text-text-tertiary">
          Clear the search and filters to rearrange your ranking.
        </p>
        {visible.map((entry) => (
          <div key={entry.item.levelProgressId} className="mb-2">
            <StaticRow
              entry={entry}
              lastRank={entries.length}
              scale={scale}
              config={config}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={clearActive}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing placed yet."
            description="Drag a completion up from below to start your ranking — in manual mode the order is the rating."
          />
        ) : (
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {rows.map((entry) => (
              <SortableRankedRow
                key={entry.item.levelProgressId}
                entry={entry}
                lastRank={rows.length}
                scale={scale}
                config={config}
              />
            ))}
          </SortableContext>
        )}

        {unranked.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
              Unranked · {unranked.length}
            </h2>
            <p className="mb-2 text-xs text-text-secondary">
              Completions with no place yet. Drag one into the list above.
            </p>
            <div className="space-y-2">
              {unranked.map((item) => (
                <UnrankedCard key={item.levelProgressId} item={item} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* The dragged row follows the cursor at full size — the placeholder it
          left behind is what shows where it would land. */}
      <DragOverlay>
        {activeItem && (
          <div className="opacity-90">
            <LevelIdentityCard item={activeItem} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

/** A row with no drag affordance, for the filtered view. */
function StaticRow({
  entry,
  lastRank,
  scale,
  config,
}: {
  entry: RankedEntry
  lastRank: number
  scale: RatingDisplayScale
  config: OverallRatingConfig
}) {
  return (
    <RankedRow
      entry={entry}
      lastRank={lastRank}
      scale={scale}
      config={config}
      categories={[]}
      showRating={false}
      editing={false}
      onEdit={() => {}}
      onCancel={() => {}}
      onSave={() => {}}
      saving={false}
    />
  )
}

function SortableRankedRow({
  entry,
  lastRank,
  scale,
  config,
}: {
  entry: RankedEntry
  lastRank: number
  scale: RatingDisplayScale
  config: OverallRatingConfig
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.item.levelProgressId })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`mb-2 flex items-center gap-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <div className="min-w-0 flex-1">
        <RankedRow
          entry={entry}
          lastRank={lastRank}
          scale={scale}
          config={config}
          categories={[]}
          showRating={false}
          editing={false}
          onEdit={() => {}}
          onCancel={() => {}}
          onSave={() => {}}
          saving={false}
        />
      </div>
    </div>
  )
}

/** One completion in the unranked pile — a drag source only. */
function UnrankedCard({ item }: { item: LevelProgressListItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: unrankedDragId(item.levelProgressId),
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <div className="min-w-0 flex-1">
        <LevelIdentityCard item={item} />
      </div>
    </div>
  )
}

/** The row's identity block on its own, for the pile and the drag overlay. */
function LevelIdentityCard({ item }: { item: LevelProgressListItem }) {
  return (
    <div className="flex h-[72px] items-center gap-3 overflow-hidden rounded-card border border-border-subtle bg-bg-surface px-2">
      <LevelIdentity rank={null} level={item.level} nameColor={undefined} />
    </div>
  )
}
