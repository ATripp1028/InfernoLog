import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Collision, CollisionDetection } from '@dnd-kit/core'

vi.mock('@dnd-kit/core', () => ({
  pointerWithin: vi.fn(() => []),
  closestCenter: vi.fn(() => []),
  rectIntersection: vi.fn(() => []),
}))

const { closestCenter, pointerWithin, rectIntersection } =
  await import('@dnd-kit/core')
const { useMultiContainerCollisionDetection } =
  await import('../collisionDetection')

const CONTAINERS = ['placed', 'unplaced'] as const
/** Row height, so a gap distance can be compared against `height * 1.5`. */
const ROW_HEIGHT = 40

/** A collision hit, optionally carrying closestCenter's distance. */
const hit = (id: string, distance?: number): Collision =>
  ({
    id,
    ...(distance === undefined ? {} : { data: { value: distance } }),
  }) as Collision

/** Points each detector at a fixed answer for this check. */
function detectorsReturn(answers: {
  pointer?: Collision[]
  center?: Collision[]
  rect?: Collision[]
}) {
  vi.mocked(pointerWithin).mockReturnValue(answers.pointer ?? [])
  vi.mocked(closestCenter).mockReturnValue(answers.center ?? [])
  vi.mocked(rectIntersection).mockReturnValue(answers.rect ?? [])
}

/** The dnd-kit args shape, reduced to what this detector reads. */
const args = (activeId = 'row-1') =>
  ({
    active: { id: activeId },
    collisionRect: { height: ROW_HEIGHT },
    droppableContainers: [],
  }) as unknown as Parameters<CollisionDetection>[0]

function render() {
  const { result } = renderHook(() =>
    useMultiContainerCollisionDetection(CONTAINERS)
  )
  return result
}

/** The id the detector resolves `over` to, or null for a no-op. */
const overId = (detect: CollisionDetection, activeId = 'row-1') =>
  detect(args(activeId))[0]?.id ?? null

beforeEach(() => {
  detectorsReturn({})
})

describe('useMultiContainerCollisionDetection', () => {
  // The pointer is the primary signal: a drop registers the moment it is over
  // a row, rather than waiting for the dragged item's centre to arrive.
  describe('with the pointer over a row', () => {
    it('resolves to the row under the pointer', () => {
      detectorsReturn({ pointer: [hit('row-2')] })

      expect(overId(render().current.collisionDetection)).toBe('row-2')
    })

    // The dragged row's own droppable stays mounted and enabled for the whole
    // drag, so it would otherwise report itself as its own target.
    it('prefers a real neighbour over the dragged row itself', () => {
      detectorsReturn({ pointer: [hit('row-1'), hit('row-2')] })

      expect(overId(render().current.collisionDetection)).toBe('row-2')
    })

    // Picking a card up and putting it back down near its start should be a
    // no-op, which onDragEnd already handles via over.id === active.id.
    it('lets the dragged row win when it is the only hit', () => {
      detectorsReturn({ pointer: [hit('row-1')] })

      expect(overId(render().current.collisionDetection)).toBe('row-1')
    })

    // Sortable computes overIndex = items.indexOf(over.id); a container id is
    // not in that list, so it yields -1 and no displacement at all.
    it('ignores the column droppables', () => {
      detectorsReturn({ pointer: [hit('placed'), hit('row-2')] })

      expect(overId(render().current.collisionDetection)).toBe('row-2')
    })

    // Dropping into an EMPTY column has no row to hit, so once no row is
    // available anywhere the bare column hit is allowed through as the last
    // resort — that is how an item reaches a column with nothing in it.
    it('falls back to the column itself when no row is available', () => {
      detectorsReturn({ pointer: [hit('placed')], center: [], rect: [] })

      expect(overId(render().current.collisionDetection)).toBe('placed')
    })
  })

  // In the small gap between two rows the pointer is over no row at all, and
  // pointerWithin resolves to the column — the bug that made the placeholder
  // snap back to the drag's start.
  describe('with the pointer in the gap between rows', () => {
    it('falls back to the nearest row centre', () => {
      detectorsReturn({
        pointer: [hit('placed')],
        center: [hit('row-2', 10), hit('row-3', 90)],
      })

      expect(overId(render().current.collisionDetection)).toBe('row-2')
    })

    // closestCenter has no distance cutoff of its own — it returns every
    // droppable sorted by distance — so a cap keeps a pointer that has left
    // the board from grabbing the nearest row anyway.
    it('accepts a row within about one row’s height', () => {
      detectorsReturn({
        pointer: [],
        center: [hit('row-2', ROW_HEIGHT * 1.5)],
      })

      expect(overId(render().current.collisionDetection)).toBe('row-2')
    })

    it('rejects a row beyond that, leaving the drag a no-op', () => {
      detectorsReturn({
        pointer: [],
        center: [hit('row-2', ROW_HEIGHT * 1.5 + 1)],
        rect: [],
      })

      expect(overId(render().current.collisionDetection)).toBeNull()
    })

    it('does not fall back onto the dragged row itself', () => {
      detectorsReturn({
        pointer: [],
        center: [hit('row-1', 1), hit('row-2', 5)],
      })

      expect(overId(render().current.collisionDetection)).toBe('row-2')
    })

    it('ignores a column among the nearest centres', () => {
      detectorsReturn({
        pointer: [],
        center: [hit('placed', 1), hit('row-2', 5)],
      })

      expect(overId(render().current.collisionDetection)).toBe('row-2')
    })

    // Without a distance dnd-kit's cap cannot be applied, so the fallback
    // declines rather than accepting an unmeasured hit.
    it('declines a nearest row with no measured distance', () => {
      detectorsReturn({ pointer: [], center: [hit('row-2')], rect: [] })

      expect(overId(render().current.collisionDetection)).toBeNull()
    })

    // Last resort for keyboard drags, where there is no pointer at all.
    it('falls back to rect intersection when nothing else hits', () => {
      detectorsReturn({ pointer: [], center: [], rect: [hit('row-2')] })

      expect(overId(render().current.collisionDetection)).toBe('row-2')
    })
  })

  // Moving an item across containers reflows both on the very next render. If
  // the pointer has not moved, the next check runs against those new rects and
  // can bounce the item back — which reflows again, forever ("Maximum update
  // depth exceeded").
  describe('just after a cross-container move', () => {
    let rafCallbacks: FrameRequestCallback[]

    beforeEach(() => {
      rafCallbacks = []
      vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
        rafCallbacks.push(fn)
        return 1
      })
    })

    /** Runs the pending frame, ending the freeze. */
    const nextFrame = () => {
      for (const fn of rafCallbacks.splice(0)) fn(0)
    }

    it('pins to the row it last resolved instead of the new layout', () => {
      const result = render()
      detectorsReturn({ pointer: [hit('row-9')] })
      overId(result.current.collisionDetection)

      result.current.markCrossContainerMove()
      // The post-move reflow slides a source-column row under the pointer.
      detectorsReturn({ pointer: [hit('row-2')] })

      expect(overId(result.current.collisionDetection)).toBe('row-9')
    })

    it('trusts the layout again on the next frame', () => {
      const result = render()
      detectorsReturn({ pointer: [hit('row-9')] })
      overId(result.current.collisionDetection)
      result.current.markCrossContainerMove()
      detectorsReturn({ pointer: [hit('row-2')] })

      nextFrame()

      expect(overId(result.current.collisionDetection)).toBe('row-2')
    })

    it('stays a no-op if nothing had resolved yet', () => {
      const result = render()

      result.current.markCrossContainerMove()
      detectorsReturn({ pointer: [hit('row-2')] })

      expect(overId(result.current.collisionDetection)).toBeNull()
    })

    // The freeze must not consult the detectors at all — that is the point.
    it('does not ask the detectors while frozen', () => {
      const result = render()
      detectorsReturn({ pointer: [hit('row-9')] })
      overId(result.current.collisionDetection)
      result.current.markCrossContainerMove()
      vi.mocked(pointerWithin).mockClear()

      overId(result.current.collisionDetection)

      expect(pointerWithin).not.toHaveBeenCalled()
    })
  })

  // ListMergeBoard has three columns, RankingBoard two — the container set is
  // whatever the caller declares.
  it('honours an arbitrary set of container ids', () => {
    const { result } = renderHook(() =>
      useMultiContainerCollisionDetection(['a', 'b', 'c'])
    )
    detectorsReturn({ pointer: [hit('c'), hit('row-2')] })

    expect(overId(result.current.collisionDetection)).toBe('row-2')
  })

  it('keeps a stable marker identity across re-renders', () => {
    const { result, rerender } = renderHook(() =>
      useMultiContainerCollisionDetection(CONTAINERS)
    )
    const { markCrossContainerMove } = result.current

    rerender()

    expect(result.current.markCrossContainerMove).toBe(markCrossContainerMove)
  })
})
