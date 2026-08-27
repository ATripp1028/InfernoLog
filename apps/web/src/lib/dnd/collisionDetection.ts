import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { useCallback, useRef } from 'react'

/**
 * Cursor-based collision for a multi-container sortable board: a drop
 * registers the moment the pointer is over a row/card, instead of waiting
 * for the dragged item's centre to reach a row centre (closestCenter).
 * Falls back to rect-intersection for keyboard drags, where there's no
 * pointer. `containerIds` are the droppable ids for the columns themselves
 * (as opposed to the individual row/card ids within them) — needed to
 * distinguish "pointer is over a row" from "pointer is over the column
 * itself" below.
 *
 * Three dnd-kit quirks make the naive version of this fragile:
 *
 * 1. The dragged row's own droppable stays mounted (and enabled) in its
 *    original slot for the duration of the drag — DragOverlay only fades it
 *    via opacity, it never removes it. pointerWithin/rectIntersection would
 *    otherwise happily report the dragged item as its own `over`, even once
 *    the pointer has clearly moved into a neighbour's row.
 * 2. When the pointer sits in the small gap between two rows rather than
 *    literally over one, pointerWithin/rectIntersection can resolve `over` to
 *    the *column* droppable instead of a row. Sortable's
 *    `overIndex = items.indexOf(over.id)` is then -1, so it applies no
 *    displacement — the placeholder appears to snap back to the drag's start.
 *    This showed up directionally (only dragging upward) because that's the
 *    side where the gap-vs-row ambiguity happened to land on the container.
 *
 * The dragged item's own row is a *legitimate* answer too, though — a user
 * picking a card up and putting it back down near its start should be a
 * no-op, and onDragEnd already treats `over.id === active.id` that way. So
 * self is only excluded once a real neighbour is also under the pointer;
 * if self is the sole hit, it wins and the drop is left alone.
 *
 * 3. Moving an item across containers (handled by the caller's onDragOver)
 *    changes both containers' layout on the very next render: the source
 *    column's remaining rows shift to fill the gap, the destination
 *    column's rows shift to make room. If the pointer hasn't moved since,
 *    the *next* collision check runs against those new rects — which can
 *    legitimately, but wrongly, land back on a row in the source column
 *    (its rows slid toward the pointer) and bounce the item back, which
 *    shifts layout again, which bounces it forward again... an infinite
 *    React "Maximum update depth exceeded" loop. This is a documented
 *    dnd-kit gotcha (see their multi-container sortable example). The fix:
 *    the caller calls `markCrossContainerMove()` whenever it moves an item to
 *    a new container, which pins collision detection to the row it just
 *    placed the item next to for one animation frame instead of trusting the
 *    transient post-move layout — long enough for onDragOver's
 *    `activeC === overC` check to settle the churn, until the pointer
 *    actually moves again.
 *
 * Originally written for DemonListBoard's two-container (placed/unplaced)
 * board; generalized here to an arbitrary set of container ids so
 * ListMergeBoard's three columns share the same well-tested logic.
 *
 * A hook (not a plain factory) so the recentlyMoved/lastOverId bookkeeping
 * lives entirely inside callback bodies, never touched during render.
 */
export function useMultiContainerCollisionDetection(
  containerIds: readonly string[]
) {
  const containerIdSet = useRef(new Set(containerIds)).current
  const recentlyMoved = useRef(false)
  const lastOverId = useRef<UniqueIdentifier | null>(null)

  // Call from onDragOver right after moving the active item into a
  // different container. Freezes collision detection for one frame so the
  // layout shift that move causes can't bounce it straight back.
  const markCrossContainerMove = useCallback(() => {
    recentlyMoved.current = true
    requestAnimationFrame(() => {
      recentlyMoved.current = false
    })
  }, [])

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (recentlyMoved.current) {
        return lastOverId.current ? [{ id: lastOverId.current }] : []
      }

      const rowHits = (
        collisions: ReturnType<CollisionDetection>
      ): ReturnType<CollisionDetection> =>
        collisions.filter((c) => !containerIdSet.has(String(c.id)))
      const excludingSelf = (
        collisions: ReturnType<CollisionDetection>
      ): ReturnType<CollisionDetection> =>
        collisions.filter((c) => c.id !== args.active.id)

      const record = (
        result: ReturnType<CollisionDetection>
      ): ReturnType<CollisionDetection> => {
        if (result.length > 0) lastOverId.current = result[0]!.id
        return result
      }

      const pointerRows = rowHits(pointerWithin(args))
      const pointerNeighbours = excludingSelf(pointerRows)
      if (pointerNeighbours.length > 0) return record(pointerNeighbours)
      if (pointerRows.length > 0) return record(pointerRows) // pointer is only over itself — no-op

      // Pointer is in the gap between rows, over no row at all — fall back to
      // nearest-row-centre so `over` still resolves to a real neighbour
      // instead of the ambiguous column droppable. closestCenter has no
      // distance cutoff of its own (it always returns every droppable sorted
      // by distance), so cap it here: only accept the nearest row if it's
      // within about one row's height — otherwise the pointer has left the
      // board entirely and the drag should stay a no-op, same as the old
      // rectIntersection-based fallback.
      const centerRows = excludingSelf(rowHits(closestCenter(args)))
      const nearest = centerRows[0]
      const nearestDistance =
        typeof nearest?.data?.value === 'number' ? nearest.data.value : null
      const maxGapDistance = args.collisionRect.height * 1.5
      if (
        nearest &&
        nearestDistance !== null &&
        nearestDistance <= maxGapDistance
      ) {
        return record([nearest])
      }

      const byPointer = pointerWithin(args)
      return record(byPointer.length > 0 ? byPointer : rectIntersection(args))
    },
    [containerIdSet]
  )

  return { collisionDetection, markCrossContainerMove }
}
