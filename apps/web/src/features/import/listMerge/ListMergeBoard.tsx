import { forwardRef } from 'react'
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/generic/button'
import { cn } from '@/lib/utils'
import { DragHandle } from '@/features/settings/components/DragHandle'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import {
  useListMergeBoard,
  type ContainerId,
  type ListMergeEntry,
} from './useListMergeBoard'

export type { ListMergeEntry }

interface ListMergeBoardProps {
  title: string
  mergedSeed: ListMergeEntry[]
  importedRemainder: ListMergeEntry[]
  existingRemainder: ListMergeEntry[]
  // The two full original orderings, un-merged — back the "Use spreadsheet
  // order" / "Use InfernoLog order" bulk actions, for when reconciling two
  // orders by hand (remembering both at once) isn't worth the effort.
  importedOrder: ListMergeEntry[]
  existingOrder: ListMergeEntry[]
  onConfirm: (finalOrder: string[]) => void
  onCancel: () => void
}

function entryLabel(entry: ListMergeEntry): string {
  return entry.levelName ?? `Level ${entry.levelId}`
}

interface EntryCardProps {
  entry: ListMergeEntry
  handle?: React.ReactNode
  isDragging?: boolean
  style?: React.CSSProperties
  muted?: boolean
}

const EntryCard = forwardRef<HTMLDivElement, EntryCardProps>(
  ({ entry, handle, isDragging, style, muted }, ref) => (
    <div
      ref={ref}
      style={style}
      className={cn(
        'relative flex items-center gap-2 overflow-hidden rounded-md border px-2 py-2 text-sm',
        muted
          ? 'border-dashed border-border-subtle text-muted-foreground'
          : 'border-border bg-bg-surface',
        isDragging && 'opacity-50'
      )}
    >
      {/* Decorative — the level name span already conveys identity; this is
          purely so chips read apart from each other at a glance. Thumbnails
           404 for some levels, so fail silently rather than showing a broken
          image icon. */}
      <img
        src={levelThumbnailUrl(entry.levelId)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        className={cn(
          'pointer-events-none absolute inset-0 size-full object-cover',
          muted ? 'opacity-20' : 'opacity-35'
        )}
      />
      <div className="pointer-events-none absolute inset-0 bg-bg-surface/70" />
      {handle && <span className="relative z-10">{handle}</span>}
      <span className="relative z-10 min-w-0 flex-1 truncate">
        {entryLabel(entry)}
      </span>
    </div>
  )
)
EntryCard.displayName = 'EntryCard'

function SortableEntryCard({ entry }: { entry: ListMergeEntry }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.levelId })
  return (
    <EntryCard
      ref={setNodeRef}
      entry={entry}
      isDragging={isDragging}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
      }}
      handle={<DragHandle listeners={listeners} attributes={attributes} />}
    />
  )
}

// A contested id's non-interactive echo — same identity as the draggable
// card in the left column, shown here purely for "this is where it was"
// context. Never part of the DnD item set.
function ReferenceCard({ entry }: { entry: ListMergeEntry }) {
  return <EntryCard entry={entry} muted />
}

function Column({
  id,
  title,
  count,
  children,
}: {
  id: ContainerId
  title: string
  count: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    // Fixed width, not flex-1 — same treatment as RankingBoard's Unplaced
    // column (see RankingBoard.tsx). Keeps every column wide enough for a
    // level name at any modal size instead of the three splitting whatever
    // width happens to be left over; the row scrolls horizontally instead
    // of squeezing columns down when it doesn't all fit.
    <div className="flex w-[230px] shrink-0 flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {title} {count > 0 && <span className="tabular-nums">({count})</span>}
      </p>
      {/*
        Fixed max-height + its own scrollbar — same treatment as
        RankingBoard's Unplaced panel (see UnplacedPanel.tsx), so a long list
        scrolls within its own column instead of growing the row (and with
        it the whole modal) taller, which would otherwise push the title and
        Confirm/Cancel footer out of view.
      */}
      <div
        ref={setNodeRef}
        className={cn(
          'max-h-[360px] min-h-[240px] space-y-1.5 overflow-y-auto rounded-lg border border-border p-2',
          isOver && 'bg-primary-dim ring-1 ring-primary'
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Three-column git-merge-style board for reconciling two orderings (an
 * existing DB order vs. an imported sheet order) — used by Collections and
 * Ranking. Only ever rendered when the backend's computeListMerge found a
 * genuine conflict (see apps/api/src/utils/listMerge.ts); when it didn't,
 * the wizard uses mergedSeed directly and skips this component entirely.
 *
 * Left column ("Imported") and right column ("Existing") are the source
 * pools — entries still needing a decision. Middle column ("Merged") is the
 * working result, pre-seeded from mergedSeed. A levelId present in both
 * importedRemainder and existingRemainder is ONE contested entry: the
 * interactive, draggable card lives in the left column; the right column
 * shows a non-interactive reference card at the same identity so the user
 * can see "this used to be here" without a second, independently-draggable
 * copy of the same id (dnd-kit requires unique ids per drag context).
 *
 * Confirming never requires every entry to be placed — an entry left in
 * either source column is voided (excluded from the final order), gated by
 * a required acknowledgement checkbox once anything would be lost.
 */
export function ListMergeBoard({
  title,
  mergedSeed,
  importedRemainder,
  existingRemainder,
  importedOrder,
  existingOrder,
  onConfirm,
  onCancel,
}: ListMergeBoardProps) {
  const {
    sensors,
    collisionDetection,
    containers,
    entriesById,
    contestedReferenceCards,
    activeEntry,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    clearActive,
    applyWholeOrder,
    unplacedCount,
    acknowledgeVoid,
    setAcknowledgeVoid,
    canConfirm,
    finalOrder,
  } = useListMergeBoard({
    mergedSeed,
    importedRemainder,
    existingRemainder,
    importedOrder,
    existingOrder,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{title}</strong> — your
          spreadsheet and existing data disagree on order. Drag entries into the
          middle to decide the final order, or pick one side entirely.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyWholeOrder(importedOrder)}
          >
            Use spreadsheet order
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyWholeOrder(existingOrder)}
          >
            Use InfernoLog order
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={clearActive}
      >
        <div className="flex gap-3 overflow-x-auto pb-1">
          <Column id="left" title="Imported" count={containers.left.length}>
            <SortableContext
              items={containers.left}
              strategy={verticalListSortingStrategy}
            >
              {containers.left.map((id) => {
                const entry = entriesById.get(id)
                return entry ? (
                  <SortableEntryCard key={id} entry={entry} />
                ) : null
              })}
            </SortableContext>
          </Column>

          <Column
            id="middle"
            title="Merged order"
            count={containers.middle.length}
          >
            <SortableContext
              items={containers.middle}
              strategy={verticalListSortingStrategy}
            >
              {containers.middle.map((id) => {
                const entry = entriesById.get(id)
                return entry ? (
                  <SortableEntryCard key={id} entry={entry} />
                ) : null
              })}
            </SortableContext>
          </Column>

          <Column id="right" title="Existing" count={containers.right.length}>
            {contestedReferenceCards.length > 0 && (
              <div className="space-y-1.5 pb-1.5">
                {contestedReferenceCards.map((entry) => (
                  <ReferenceCard key={entry.levelId} entry={entry} />
                ))}
                <p className="px-1 text-[10px] text-muted-foreground">
                  Also imported at a different position — see Imported column.
                </p>
              </div>
            )}
            <SortableContext
              items={containers.right}
              strategy={verticalListSortingStrategy}
            >
              {containers.right.map((id) => {
                const entry = entriesById.get(id)
                return entry ? (
                  <SortableEntryCard key={id} entry={entry} />
                ) : null
              })}
            </SortableContext>
          </Column>
        </div>

        <DragOverlay>
          {activeEntry ? <EntryCard entry={activeEntry} /> : null}
        </DragOverlay>
      </DndContext>

      {unplacedCount > 0 && (
        <label className="flex items-start gap-2 text-xs text-warning-soft">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acknowledgeVoid}
            onChange={(e) => setAcknowledgeVoid(e.target.checked)}
          />
          I understand {unplacedCount} entr{unplacedCount === 1 ? 'y' : 'ies'}{' '}
          not placed in the merged order will not be included.
        </label>
      )}

      <div className="flex gap-3 border-t border-border pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(finalOrder)} disabled={!canConfirm}>
          Confirm order
        </Button>
      </div>
    </div>
  )
}
