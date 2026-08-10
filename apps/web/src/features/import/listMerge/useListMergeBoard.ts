// Logic for ListMergeBoard: the three columns' contents, the cross-column
// drag rules, the bulk "use one side's order" actions, and the void gate that
// blocks confirming while entries are still unplaced.
//
// A levelId present in both importedRemainder and existingRemainder is ONE
// contested entry: the interactive, draggable card lives in the left column
// and the right column shows a non-interactive reference card at the same
// identity — dnd-kit requires unique ids per drag context, so it cannot be
// draggable in both.

import { useMemo, useState } from 'react'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useSortableSensors } from '@/features/settings/hooks/useSortableSensors'
import { useMultiContainerCollisionDetection } from '@/lib/dnd/collisionDetection'

export interface ListMergeEntry {
  levelId: string
  levelName: string | null
}

export type ContainerId = 'left' | 'middle' | 'right'

export function useListMergeBoard({
  mergedSeed,
  importedRemainder,
  existingRemainder,
  importedOrder,
  existingOrder,
}: {
  mergedSeed: ListMergeEntry[]
  importedRemainder: ListMergeEntry[]
  existingRemainder: ListMergeEntry[]
  // Both full orderings, so every entry the bulk actions can place is in
  // entriesById even when it isn't in either remainder.
  importedOrder: ListMergeEntry[]
  existingOrder: ListMergeEntry[]
}) {
  const sensors = useSortableSensors()

  const entriesById = useState(() => {
    const m = new Map<string, ListMergeEntry>()
    for (const e of [
      ...mergedSeed,
      ...importedRemainder,
      ...existingRemainder,
      ...importedOrder,
      ...existingOrder,
    ]) {
      m.set(e.levelId, e)
    }
    return m
  })[0]

  const contestedIds = useState(() => {
    const importedIds = new Set(importedRemainder.map((e) => e.levelId))
    return new Set(
      existingRemainder
        .map((e) => e.levelId)
        .filter((id) => importedIds.has(id))
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

  // See collisionDetection.ts for why this needs to be more than
  // pointerWithin/rectIntersection alone.
  const { collisionDetection, markCrossContainerMove } =
    useMultiContainerCollisionDetection(['left', 'middle', 'right'])

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

    markCrossContainerMove()
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

  // Bulk escape hatches: pick one side's order wholesale instead of
  // reconciling by hand — the manual drag flow requires holding both orders
  // in your head at once to notice where they actually disagree, which gets
  // impractical past a handful of entries.
  const applyWholeOrder = (order: ListMergeEntry[]) => {
    setContainers({ left: [], middle: order.map((e) => e.levelId), right: [] })
    setAcknowledgeVoid(false)
  }

  const unplacedCount = containers.left.length + containers.right.length
  const canConfirm = unplacedCount === 0 || acknowledgeVoid
  const activeEntry = activeId ? entriesById.get(activeId) : null

  // existingRemainder/contestedIds are both stable after mount (contestedIds
  // is itself a lazy-initialized useState — see above), but handleDragOver
  // calls setContainers on every cross-container pointer move, re-rendering
  // this component constantly during a drag — memoized so that doesn't
  // re-filter the full existing-list remainder on every pointer move.
  const contestedReferenceCards = useMemo(
    () => existingRemainder.filter((e) => contestedIds.has(e.levelId)),
    [existingRemainder, contestedIds]
  )

  return {
    sensors,
    collisionDetection,
    containers,
    entriesById,
    contestedReferenceCards,

    // Drag
    activeId,
    activeEntry,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    clearActive: () => setActiveId(null),

    // Bulk + confirm gate
    applyWholeOrder,
    unplacedCount,
    acknowledgeVoid,
    setAcknowledgeVoid,
    canConfirm,
    // The middle column IS the final order.
    finalOrder: containers.middle,
  }
}
