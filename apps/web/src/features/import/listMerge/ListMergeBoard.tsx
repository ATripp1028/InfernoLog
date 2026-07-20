// Three-column git-merge-style board for reconciling two orderings (an
// existing DB order vs. an imported sheet order) — used by Collections and
// Ranking. Only ever rendered when the backend's computeListMerge found a
// genuine conflict (see apps/api/src/utils/listMerge.ts); when it didn't,
// the wizard uses mergedSeed directly and skips this component entirely.
//
// Left column ("Imported") and right column ("Existing") are the source
// pools — entries still needing a decision. Middle column ("Merged") is the
// working result, pre-seeded from mergedSeed. A levelId present in both
// importedRemainder and existingRemainder is ONE contested entry: the
// interactive, draggable card lives in the left column; the right column
// shows a non-interactive reference card at the same identity so the user
// can see "this used to be here" without a second, independently-draggable
// copy of the same id (dnd-kit requires unique ids per drag context).
//
// Confirming never requires every entry to be placed — an entry left in
// either source column is voided (excluded from the final order), gated by
// a required acknowledgement checkbox once anything would be lost.

import { useState } from 'react'
import { forwardRef } from 'react'
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSortableSensors } from '@/features/settings/hooks/useSortableSensors'
import { DragHandle } from '@/features/settings/components/DragHandle'
import { createCollisionDetection } from '@/lib/dnd/collisionDetection'

export interface ListMergeEntry {
  levelId: string
  levelName: string | null
}

interface ListMergeBoardProps {
  title: string
  mergedSeed: ListMergeEntry[]
  importedRemainder: ListMergeEntry[]
  existingRemainder: ListMergeEntry[]
  onConfirm: (finalOrder: string[]) => void
  onCancel: () => void
}

type ContainerId = 'left' | 'middle' | 'right'

const collisionDetection = createCollisionDetection(['left', 'middle', 'right'])

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
        'flex items-center gap-2 rounded-md border px-2 py-2 text-sm',
        muted
          ? 'border-dashed border-[var(--color-border-subtle)] text-muted-foreground'
          : 'border-[var(--color-border)] bg-[var(--color-bg-surface)]',
        isDragging && 'opacity-50'
      )}
    >
      {handle}
      <span className="min-w-0 flex-1 truncate">{entryLabel(entry)}</span>
    </div>
  )
)
EntryCard.displayName = 'EntryCard'

function SortableEntryCard({ entry }: { entry: ListMergeEntry }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.levelId })
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
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {title} {count > 0 && <span className="tabular-nums">({count})</span>}
      </p>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[240px] flex-1 space-y-1.5 rounded-lg border border-[var(--color-border)] p-2',
          isOver && 'bg-[var(--color-primary-dim)] ring-1 ring-[var(--color-primary)]'
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function ListMergeBoard({
  title,
  mergedSeed,
  importedRemainder,
  existingRemainder,
  onConfirm,
  onCancel,
}: ListMergeBoardProps) {
  const sensors = useSortableSensors()

  const entriesById = useState(() => {
    const m = new Map<string, ListMergeEntry>()
    for (const e of [...mergedSeed, ...importedRemainder, ...existingRemainder]) {
      m.set(e.levelId, e)
    }
    return m
  })[0]

  const contestedIds = useState(() => {
    const importedIds = new Set(importedRemainder.map((e) => e.levelId))
    return new Set(
      existingRemainder.map((e) => e.levelId).filter((id) => importedIds.has(id))
    )
  })[0]

  const [containers, setContainers] = useState<Record<ContainerId, string[]>>({
    left: importedRemainder.map((e) => e.levelId),
    middle: mergedSeed.map((e) => e.levelId),
    // The right column's interactive set excludes contested ids — those are
    // shown as read-only reference cards instead (see below).
    right: existingRemainder
      .map((e) => e.levelId)
      .filter((id) => !contestedIds.has(id)),
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [acknowledgeVoid, setAcknowledgeVoid] = useState(false)

  const findContainer = (id: string): ContainerId | null => {
    if (id === 'left' || id === 'middle' || id === 'right') return id
    if (containers.left.includes(id)) return 'left'
    if (containers.middle.includes(id)) return 'middle'
    if (containers.right.includes(id)) return 'right'
    return null
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const activeC = findContainer(String(active.id))
    const overC = findContainer(String(over.id))
    if (!activeC || !overC || activeC === overC) return

    setContainers((prev) => {
      const activeItems = prev[activeC]
      const overItems = prev[overC]
      const overIsContainer =
        over.id === 'left' || over.id === 'middle' || over.id === 'right'
      const overIndex = overIsContainer
        ? overItems.length
        : overItems.indexOf(String(over.id))
      const insertAt = overIndex < 0 ? overItems.length : overIndex
      return {
        ...prev,
        [activeC]: activeItems.filter((id) => id !== String(active.id)),
        [overC]: [
          ...overItems.slice(0, insertAt),
          String(active.id),
          ...overItems.slice(insertAt),
        ],
      }
    })
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    const id = String(active.id)
    setActiveId(null)
    if (!over) return

    const end = findContainer(id)
    if (end !== 'middle') return
    const overC = findContainer(String(over.id))
    if (overC !== 'middle' || String(over.id) === id) return

    setContainers((prev) => {
      const from = prev.middle.indexOf(id)
      const to = prev.middle.indexOf(String(over.id))
      if (from < 0 || to < 0) return prev
      return { ...prev, middle: arrayMove(prev.middle, from, to) }
    })
  }

  const unplacedCount = containers.left.length + containers.right.length
  const canConfirm = unplacedCount === 0 || acknowledgeVoid
  const activeEntry = activeId ? entriesById.get(activeId) : null

  const contestedReferenceCards = existingRemainder.filter((e) =>
    contestedIds.has(e.levelId)
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{title}</strong> — your
        spreadsheet and existing data disagree on order. Drag entries into
        the middle to decide the final order.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-3">
          <Column id="left" title="Imported" count={containers.left.length}>
            <SortableContext
              items={containers.left}
              strategy={verticalListSortingStrategy}
            >
              {containers.left.map((id) => {
                const entry = entriesById.get(id)
                return entry ? <SortableEntryCard key={id} entry={entry} /> : null
              })}
            </SortableContext>
          </Column>

          <Column id="middle" title="Merged order" count={containers.middle.length}>
            <SortableContext
              items={containers.middle}
              strategy={verticalListSortingStrategy}
            >
              {containers.middle.map((id) => {
                const entry = entriesById.get(id)
                return entry ? <SortableEntryCard key={id} entry={entry} /> : null
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
                return entry ? <SortableEntryCard key={id} entry={entry} /> : null
              })}
            </SortableContext>
          </Column>
        </div>

        <DragOverlay>
          {activeEntry ? <EntryCard entry={activeEntry} /> : null}
        </DragOverlay>
      </DndContext>

      {unplacedCount > 0 && (
        <label className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={acknowledgeVoid}
            onChange={(e) => setAcknowledgeVoid(e.target.checked)}
          />
          I understand {unplacedCount} entr{unplacedCount === 1 ? 'y' : 'ies'} not
          placed in the merged order will not be included.
        </label>
      )}

      <div className="flex gap-3 border-t border-[var(--color-border)] pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(containers.middle)}
          disabled={!canConfirm}
        >
          Confirm order
        </Button>
      </div>
    </div>
  )
}
