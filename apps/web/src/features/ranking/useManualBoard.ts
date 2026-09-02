// Drag state for the MANUAL ranking: reordering the ranked list, and placing a
// completion into it from the unranked pile.
//
// Deliberately simpler than the demon list's board (features/demon-list/
// useDemonListBoard), which carries items BETWEEN two sortable columns and needs
// mid-drag container transfer to preview that. Here the pile is a source only:
// an unranked item is a plain draggable that lands at the index it was dropped
// on. No transfer state, no preview reconciliation, and the outcome the user
// sees is identical.
//
// Both writes are neighbour-based, not index-based: the server owns the
// fractional indices and may renormalise the whole list on the way, so the
// client says "between these two rows" and reads the authoritative order back
// out of the response.

import { useMemo, useState } from 'react'
import {
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { neighboursAround } from '@/lib/neighbours'
import { usePlaceRating, useReorderRating } from '@/lib/api/ratingRanking'
import { toast } from '@/components/generic/sonner'
import type { RankedEntry } from './rankingModel'
import type { LevelProgressListItem } from '@infernolog/core'

/** The `unranked-` prefix marks a draggable that is not yet in the list. */
const UNRANKED_PREFIX = 'unranked-'

/** The drag id for an unranked completion. */
export const unrankedDragId = (levelProgressId: string) =>
  `${UNRANKED_PREFIX}${levelProgressId}`

const isUnrankedId = (id: string) => id.startsWith(UNRANKED_PREFIX)
const levelProgressIdOf = (id: string) =>
  isUnrankedId(id) ? id.slice(UNRANKED_PREFIX.length) : id

interface UseManualBoardArgs {
  entries: readonly RankedEntry[]
  unranked: readonly LevelProgressListItem[]
}

/**
 * Everything the MANUAL ranking's drag-and-drop needs.
 *
 * @returns `order` is the ranked list to render — the live optimistic order
 * while a drag is settling, and the server's order otherwise.
 */
export function useManualBoard({ entries, unranked }: UseManualBoardArgs) {
  const place = usePlaceRating()
  const reorder = useReorderRating()

  const [activeId, setActiveId] = useState<string | null>(null)
  // Set on drop so the list shows the new order immediately; cleared when the
  // server's response arrives and becomes the truth.
  const [optimistic, setOptimistic] = useState<string[] | null>(null)

  const sensors = useSensors(
    // A small distance threshold so a click on a row still reads as a click and
    // follows its link, rather than starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const serverOrder = useMemo(
    () => entries.map((e) => e.item.levelProgressId),
    [entries]
  )
  const order = optimistic ?? serverOrder

  const byId = useMemo(() => {
    const map = new Map<string, RankedEntry['item']>()
    for (const entry of entries) map.set(entry.item.levelProgressId, entry.item)
    for (const item of unranked) map.set(item.levelProgressId, item)
    return map
  }, [entries, unranked])

  /** The rows to render, renumbered against the live order. */
  const rows: RankedEntry[] = useMemo(
    () =>
      order.flatMap((id, index) => {
        const item = byId.get(id)
        return item ? [{ rank: index + 1, item }] : []
      }),
    [order, byId]
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const active = String(event.active.id)
    setActiveId(null)
    if (!event.over) return

    const overId = String(event.over.id)
    const movingId = levelProgressIdOf(active)

    // Where the dragged row ends up in the final list. Dropping on the pile's
    // own droppable (or on itself) is a no-op rather than a move to nowhere.
    const overIndex = order.indexOf(levelProgressIdOf(overId))
    if (overIndex === -1 && order.length > 0) return

    if (isUnrankedId(active)) {
      const index = overIndex === -1 ? 0 : overIndex
      const next = [...order]
      next.splice(index, 0, movingId)
      setOptimistic(next)
      place.mutate(
        { levelProgressId: movingId, ...neighboursAround(next, index) },
        {
          onSettled: () => setOptimistic(null),
          onError: (error) => toast.error(saveFailed(error)),
        }
      )
      return
    }

    const from = order.indexOf(movingId)
    if (from === -1 || from === overIndex) return
    const next = arrayMove([...order], from, overIndex)
    setOptimistic(next)
    reorder.mutate(
      { levelProgressId: movingId, ...neighboursAround(next, overIndex) },
      {
        onSettled: () => setOptimistic(null),
        onError: (error) => toast.error(saveFailed(error)),
      }
    )
  }

  return {
    sensors,
    order,
    rows,
    activeItem: activeId ? (byId.get(levelProgressIdOf(activeId)) ?? null) : null,
    handleDragStart,
    handleDragEnd,
    clearActive: () => setActiveId(null),
    saving: place.isPending || reorder.isPending,
  }
}

function saveFailed(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Couldn't save that move."
}
