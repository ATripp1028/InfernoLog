// Logic for DemonListBoard: the two containers' live ordering during a drag,
// the cross-container rules, and which write a completed drag turns into
// (place, reorder, unplace, or nothing).
//
// Extracted from DemonListBoard so the drag arithmetic can be exercised without
// mounting dnd-kit — same shape as the import wizard's useListMergeBoard.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutationState } from '@tanstack/react-query'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { ClassicDemonListResponse } from '@infernolog/core'
import { useSortableSensors } from '@/features/settings/hooks/useSortableSensors'
import { useMultiContainerCollisionDetection } from '@/lib/dnd/collisionDetection'
import {
  usePlaceOnDemonList,
  useReorderDemonList,
  useRemoveFromDemonList,
} from '@/lib/api/demonList'
import { neighboursAround } from './neighbours'
import {
  filterPlaced,
  filterUnplaced,
  matchesLevel,
  reorderDisabled,
} from './filtering'
import type { ContainerId, DemonListItem } from './types'

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Drag state and the resulting writes for the desktop ranking board.
 */
export function useDemonListBoard({
  data,
  search,
  showUnrated,
  unplacedSearch,
}: {
  data: ClassicDemonListResponse
  search: string
  showUnrated: boolean
  unplacedSearch: string
}) {
  const sensors = useSortableSensors()
  const place = usePlaceOnDemonList()
  const reorder = useReorderDemonList()
  const unplace = useRemoveFromDemonList()

  const pendingRankingCount = useMutationState({
    filters: { mutationKey: ['rankingReorder'], status: 'pending' },
  }).length

  // Common level data for any id, in either container.
  const itemsById = useMemo(() => {
    const m = new Map<string, DemonListItem>()
    for (const e of data.placed) m.set(e.levelProgressId, e)
    for (const e of data.unplaced) m.set(e.levelProgressId, e)
    return m
  }, [data])

  // Live, locally-controlled ordering during a drag; otherwise mirrors `data`.
  const [containers, setContainers] = useState<Record<ContainerId, string[]>>({
    placed: data.placed.map((e) => e.levelProgressId),
    unplaced: data.unplaced.map((e) => e.levelProgressId),
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const startContainer = useRef<ContainerId | null>(null)

  // See collisionDetection.ts for why this needs to be more than
  // pointerWithin/rectIntersection alone.
  const { collisionDetection, markCrossContainerMove } =
    useMultiContainerCollisionDetection(['placed', 'unplaced'])

  useEffect(() => {
    if (activeId) return // don't clobber the in-flight drag
    if (pendingRankingCount > 0) return // don't overwrite optimistic state
    setContainers({
      placed: data.placed.map((e) => e.levelProgressId),
      unplaced: data.unplaced.map((e) => e.levelProgressId),
    })
  }, [data, activeId, pendingRankingCount])

  const findContainer = (id: string): ContainerId | null => {
    if (id === 'placed' || id === 'unplaced') return id
    if (containers.placed.includes(id)) return 'placed'
    if (containers.unplaced.includes(id)) return 'unplaced'
    return null
  }

  // ── Read-only (filtered) view: no DnD, recomputed ranks ──────────────────
  const placedView = filterPlaced(data.placed, search, showUnrated)
  const filtering = reorderDisabled(
    data.placed.length,
    placedView.length,
    search
  )

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id)
    setActiveId(id)
    startContainer.current = findContainer(id)
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
      const overIsContainer = over.id === 'placed' || over.id === 'unplaced'
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
    const start = startContainer.current
    setActiveId(null)
    startContainer.current = null
    if (!over || !start) return

    const end = findContainer(id)
    if (!end) return

    // Final within-placed reorder relative to the row we dropped over.
    let placedIds = containers.placed
    if (end === 'placed') {
      const overC = findContainer(String(over.id))
      if (overC === 'placed' && String(over.id) !== id) {
        const from = placedIds.indexOf(id)
        const to = placedIds.indexOf(String(over.id))
        if (from >= 0 && to >= 0) placedIds = arrayMove(placedIds, from, to)
      }
      setContainers((prev) => ({ ...prev, placed: placedIds }))
    }

    if (end === 'placed') {
      const index = placedIds.indexOf(id)
      const neighbours = neighboursAround(placedIds, index)
      if (start === 'unplaced') {
        place.mutate({ levelProgressId: id, ...neighbours })
      } else {
        const original = data.placed.map((x) => x.levelProgressId)
        if (!sameOrder(placedIds, original)) {
          reorder.mutate({ levelProgressId: id, ...neighbours })
        }
      }
    } else if (end === 'unplaced' && start === 'placed') {
      unplace.mutate(id)
    }
    // unplaced → unplaced: nothing to persist.
  }

  /**
   * Remove a placed entry from the ranking — it returns to the Unplaced panel.
   *
   * Backs the row's X button, the click-driven twin of dragging a row out of
   * the placed column. It has to move the item between the live containers
   * itself: `unplace` is a `rankingReorder` mutation, so while it is in flight
   * the resync effect above is deliberately frozen and the optimistic cache
   * update alone would not reach the rendered list.
   */
  function removeFromDemonList(id: string) {
    if (!containers.placed.includes(id)) return
    setContainers((prev) => ({
      placed: prev.placed.filter((x) => x !== id),
      unplaced: [id, ...prev.unplaced],
    }))
    unplace.mutate(id)
  }

  // Both branches honour the unplaced search box; they differ only in which
  // ordering they read — the query data while filtering, the live container
  // otherwise, so a drag in progress is not disturbed.
  const unplacedQuery = unplacedSearch.trim().toLowerCase()
  const unplacedView = filtering
    ? filterUnplaced(data.unplaced, unplacedSearch).map(
        (e) => e.levelProgressId
      )
    : containers.unplaced.filter((id) => {
        const item = itemsById.get(id)
        if (!item) return false
        return !unplacedQuery || matchesLevel(item.level, unplacedQuery)
      })

  return {
    sensors,
    collisionDetection,
    containers,
    itemsById,

    // Drag
    activeId,
    activeItem: activeId ? (itemsById.get(activeId) ?? null) : null,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    // Cancelling must also forget where the drag began — a stale
    // startContainer would make the next drag end read as a place/reorder
    // from a container the item never left.
    clearActive: () => {
      setActiveId(null)
      startContainer.current = null
    },

    // Unplacing
    removeFromDemonList,

    // Filtered (read-only) view
    filtering,
    placedView,
    unplacedView,
  }
}
