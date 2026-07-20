import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core'

// Cursor-based collision for a multi-container sortable board: a drop
// registers the moment the pointer is over a row/card, instead of waiting
// for the dragged item's centre to reach a row centre (closestCenter).
// Falls back to rect-intersection for keyboard drags, where there's no
// pointer. `containerIds` are the droppable ids for the columns themselves
// (as opposed to the individual row/card ids within them) — needed to
// distinguish "pointer is over a row" from "pointer is over the column
// itself" below.
//
// Two dnd-kit quirks make the naive version of this fragile:
//
// 1. The dragged row's own droppable stays mounted (and enabled) in its
//    original slot for the duration of the drag — DragOverlay only fades it
//    via opacity, it never removes it. pointerWithin/rectIntersection would
//    otherwise happily report the dragged item as its own `over`, even once
//    the pointer has clearly moved into a neighbour's row.
// 2. When the pointer sits in the small gap between two rows rather than
//    literally over one, pointerWithin/rectIntersection can resolve `over` to
//    the *column* droppable instead of a row. Sortable's
//    `overIndex = items.indexOf(over.id)` is then -1, so it applies no
//    displacement — the placeholder appears to snap back to the drag's start.
//    This showed up directionally (only dragging upward) because that's the
//    side where the gap-vs-row ambiguity happened to land on the container.
//
// The dragged item's own row is a *legitimate* answer too, though — a user
// picking a card up and putting it back down near its start should be a
// no-op, and onDragEnd already treats `over.id === active.id` that way. So
// self is only excluded once a real neighbour is also under the pointer;
// if self is the sole hit, it wins and the drop is left alone.
//
// Originally written for RankingBoard's two-container (placed/unplaced)
// board; generalized here to an arbitrary set of container ids so
// ListMergeBoard's three columns share the same well-tested logic.
export function createCollisionDetection(
  containerIds: readonly string[]
): CollisionDetection {
  const containerIdSet = new Set(containerIds)

  return (args) => {
    const rowHits = (
      collisions: ReturnType<CollisionDetection>
    ): ReturnType<CollisionDetection> =>
      collisions.filter((c) => !containerIdSet.has(String(c.id)))
    const excludingSelf = (
      collisions: ReturnType<CollisionDetection>
    ): ReturnType<CollisionDetection> =>
      collisions.filter((c) => c.id !== args.active.id)

    const pointerRows = rowHits(pointerWithin(args))
    const pointerNeighbours = excludingSelf(pointerRows)
    if (pointerNeighbours.length > 0) return pointerNeighbours
    if (pointerRows.length > 0) return pointerRows // pointer is only over itself — no-op

    // Pointer is in the gap between rows, over no row at all — fall back to
    // nearest-row-centre so `over` still resolves to a real neighbour instead
    // of the ambiguous column droppable. closestCenter has no distance cutoff
    // of its own (it always returns every droppable sorted by distance), so
    // cap it here: only accept the nearest row if it's within about one row's
    // height — otherwise the pointer has left the board entirely and the
    // drag should stay a no-op, same as the old rectIntersection-based
    // fallback.
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
      return [nearest]
    }

    const byPointer = pointerWithin(args)
    return byPointer.length > 0 ? byPointer : rectIntersection(args)
  }
}
