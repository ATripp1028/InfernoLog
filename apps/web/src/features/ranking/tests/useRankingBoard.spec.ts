import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import type { ClassicRankingResponse } from '@infernolog/core'
import { queryWrapper, stubMutation } from '@/utils/testUtils'
import { level, ranked, unplaced } from './fixtures'

vi.mock('@/lib/api/ranking', () => ({
  usePlaceRanking: vi.fn(),
  useReorderRanking: vi.fn(),
  useUnplaceRanking: vi.fn(),
}))

const { usePlaceRanking, useReorderRanking, useUnplaceRanking } =
  await import('@/lib/api/ranking')
const { useRankingBoard } = await import('../useRankingBoard')

let placeMutate: ReturnType<typeof vi.fn>
let reorderMutate: ReturnType<typeof vi.fn>
let unplaceMutate: ReturnType<typeof vi.fn>

beforeEach(() => {
  placeMutate = vi.fn()
  reorderMutate = vi.fn()
  unplaceMutate = vi.fn()
  vi.mocked(usePlaceRanking).mockReturnValue(
    stubMutation({ mutate: placeMutate })
  )
  vi.mocked(useReorderRanking).mockReturnValue(
    stubMutation({ mutate: reorderMutate })
  )
  vi.mocked(useUnplaceRanking).mockReturnValue(
    stubMutation({ mutate: unplaceMutate })
  )
})

/** A board with the given placed ids and unplaced ids. */
const board = (placedIds: string[], unplacedIds: string[] = []) =>
  ({
    placed: ranked(placedIds),
    unplaced: unplacedIds.map((id) => unplaced({ levelProgressId: id })),
  }) as ClassicRankingResponse

function render(
  opts: {
    data?: ClassicRankingResponse
    search?: string
    showUnrated?: boolean
    unplacedSearch?: string
  } = {}
) {
  const { queryClient, wrapper } = queryWrapper()
  const view = renderHook(
    ({ data }: { data: ClassicRankingResponse }) =>
      useRankingBoard({
        data,
        search: opts.search ?? '',
        showUnrated: opts.showUnrated ?? true,
        unplacedSearch: opts.unplacedSearch ?? '',
      }),
    { wrapper, initialProps: { data: opts.data ?? board(['a', 'b', 'c']) } }
  )
  return { ...view, queryClient }
}

const dragStart = (id: string) => ({ active: { id } }) as DragStartEvent
const dragOver = (activeId: string, overId: string) =>
  ({ active: { id: activeId }, over: { id: overId } }) as DragOverEvent
const dragEnd = (activeId: string, overId: string | null) =>
  ({
    active: { id: activeId },
    over: overId == null ? null : { id: overId },
  }) as DragEndEvent

/** Drags an item and drops it, in the order dnd-kit fires the events. */
function drag(
  result: { current: ReturnType<typeof useRankingBoard> },
  id: string,
  over: string,
  crossTo?: string
) {
  act(() => result.current.handleDragStart(dragStart(id)))
  if (crossTo) act(() => result.current.handleDragOver(dragOver(id, crossTo)))
  act(() => result.current.handleDragEnd(dragEnd(id, over)))
}

describe('useRankingBoard', () => {
  describe('the two containers', () => {
    it('mirrors the ranked list and the unplaced pile', () => {
      const { result } = render({ data: board(['a', 'b'], ['x', 'y']) })

      expect(result.current.containers.placed).toEqual(['a', 'b'])
      expect(result.current.containers.unplaced).toEqual(['x', 'y'])
    })

    it('resolves an item from either container', () => {
      const { result } = render({ data: board(['a'], ['x']) })

      expect(result.current.itemsById.get('a')).toBeDefined()
      expect(result.current.itemsById.get('x')).toBeDefined()
    })

    it('resyncs when the query data changes', () => {
      const { result, rerender } = render({ data: board(['a', 'b']) })

      rerender({ data: board(['b', 'a']) })

      expect(result.current.containers.placed).toEqual(['b', 'a'])
    })

    // Resyncing mid-drag would yank the row out from under the cursor.
    it('holds the local order while a drag is in flight', () => {
      const { result, rerender } = render({ data: board(['a', 'b']) })
      act(() => result.current.handleDragStart(dragStart('a')))

      rerender({ data: board(['b', 'a']) })

      expect(result.current.containers.placed).toEqual(['a', 'b'])
    })

    // The optimistic cache update lands asynchronously; resyncing before the
    // reorder queue drains would snap rows back to their old positions.
    it('holds the local order while a reorder write is pending', async () => {
      const { result, rerender, queryClient } = render({
        data: board(['a', 'b']),
      })
      act(() => {
        void queryClient
          .getMutationCache()
          .build(queryClient, {
            mutationKey: ['rankingReorder'],
            mutationFn: () => new Promise(() => {}),
          })
          .execute(undefined)
      })

      rerender({ data: board(['b', 'a']) })

      await waitFor(() =>
        expect(result.current.containers.placed).toEqual(['a', 'b'])
      )
    })
  })

  describe('dragging between the containers', () => {
    it('moves an item into the container it was dropped over', () => {
      const { result } = render({ data: board(['a'], ['x']) })

      act(() => result.current.handleDragOver(dragOver('x', 'placed')))

      expect(result.current.containers.placed).toEqual(['a', 'x'])
      expect(result.current.containers.unplaced).toEqual([])
    })

    it('inserts at the position of the row it was dropped over', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      act(() => result.current.handleDragOver(dragOver('x', 'a')))

      expect(result.current.containers.placed).toEqual(['x', 'a', 'b'])
    })

    // Dropping on the container itself, rather than a row, means "the end".
    it('appends when dropped on the container', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      act(() => result.current.handleDragOver(dragOver('x', 'placed')))

      expect(result.current.containers.placed).toEqual(['a', 'b', 'x'])
    })

    it('ignores a move within one container', () => {
      const { result } = render({ data: board(['a', 'b']) })

      act(() => result.current.handleDragOver(dragOver('a', 'b')))

      expect(result.current.containers.placed).toEqual(['a', 'b'])
    })

    it('ignores a drag over nothing', () => {
      const { result } = render({ data: board(['a'], ['x']) })

      act(() =>
        result.current.handleDragOver({
          active: { id: 'x' },
          over: null,
        } as DragOverEvent)
      )

      expect(result.current.containers.unplaced).toEqual(['x'])
    })

    it('ignores an unknown id', () => {
      const { result } = render({ data: board(['a']) })

      act(() => result.current.handleDragOver(dragOver('ghost', 'placed')))

      expect(result.current.containers.placed).toEqual(['a'])
    })
  })

  describe('which write a completed drag becomes', () => {
    // Placing: the level had no position, so it gets one. dragOver inserts it
    // at the row it is hovering, then dragEnd applies the final relative move
    // — so it lands just below that row.
    it('places an item dragged in from the unplaced pile', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      drag(result, 'x', 'a', 'a')

      expect(placeMutate).toHaveBeenCalledWith({
        levelProgressId: 'x',
        aboveId: 'a',
        belowId: 'b',
      })
      expect(reorderMutate).not.toHaveBeenCalled()
    })

    it('omits the below neighbour when placed at the bottom', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      drag(result, 'x', 'b', 'b')

      expect(placeMutate).toHaveBeenCalledWith({
        levelProgressId: 'x',
        aboveId: 'b',
      })
    })

    it('omits the above neighbour when placed at the very top', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      // Hovering the container appends, then the drop over 'a' moves it up.
      drag(result, 'x', 'a', 'placed')

      expect(placeMutate).toHaveBeenCalledWith({
        levelProgressId: 'x',
        belowId: 'a',
      })
    })

    // Reordering: the level already had a position and moved within the list.
    it('reorders an item moved within the ranked list', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      drag(result, 'a', 'c')

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'a',
        aboveId: 'c',
      })
      expect(placeMutate).not.toHaveBeenCalled()
    })

    it('sends the neighbours around where it landed', () => {
      const { result } = render({ data: board(['a', 'b', 'c', 'd']) })

      drag(result, 'd', 'b')

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'd',
        aboveId: 'a',
        belowId: 'b',
      })
    })

    // A drag that ends where it began is not a reorder — writing it would
    // churn the fractional index for nothing.
    it('writes nothing when the order did not actually change', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      drag(result, 'a', 'a')

      expect(reorderMutate).not.toHaveBeenCalled()
    })

    // Unplacing: the level had a position and was dragged out of the list.
    it('unplaces an item dragged out to the unplaced pile', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      drag(result, 'a', 'x', 'unplaced')

      expect(unplaceMutate).toHaveBeenCalledWith('a')
      expect(reorderMutate).not.toHaveBeenCalled()
    })

    // Reordering the unplaced pile means nothing — it has no order.
    it('writes nothing for a move within the unplaced pile', () => {
      const { result } = render({ data: board(['a'], ['x', 'y']) })

      drag(result, 'x', 'y')

      expect(placeMutate).not.toHaveBeenCalled()
      expect(reorderMutate).not.toHaveBeenCalled()
      expect(unplaceMutate).not.toHaveBeenCalled()
    })

    it('writes nothing when the drop lands outside any container', () => {
      const { result } = render({ data: board(['a', 'b']) })

      act(() => result.current.handleDragStart(dragStart('a')))
      act(() => result.current.handleDragEnd(dragEnd('a', null)))

      expect(reorderMutate).not.toHaveBeenCalled()
    })

    // handleDragEnd needs the container the drag STARTED in to tell a place
    // from a reorder, so an end with no start is a no-op.
    it('writes nothing for a drop with no drag start', () => {
      const { result } = render({ data: board(['a', 'b']) })

      act(() => result.current.handleDragEnd(dragEnd('a', 'b')))

      expect(reorderMutate).not.toHaveBeenCalled()
      expect(placeMutate).not.toHaveBeenCalled()
    })
  })

  describe('the drag overlay', () => {
    it('tracks the dragged item', () => {
      const { result } = render({ data: board(['a', 'b']) })

      act(() => result.current.handleDragStart(dragStart('a')))

      expect(result.current.activeId).toBe('a')
      expect(result.current.activeItem?.levelProgressId).toBe('a')
    })

    it('clears it on drop', () => {
      const { result } = render({ data: board(['a', 'b']) })

      drag(result, 'a', 'b')

      expect(result.current.activeId).toBeNull()
      expect(result.current.activeItem).toBeNull()
    })

    it('clears it on cancel', () => {
      const { result } = render({ data: board(['a', 'b']) })
      act(() => result.current.handleDragStart(dragStart('a')))

      act(() => result.current.clearActive())

      expect(result.current.activeId).toBeNull()
    })

    // A cancel must also forget the container the drag began in, or the next
    // drop would be attributed to a drag that never finished.
    it('forgets where a cancelled drag began', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })
      act(() => result.current.handleDragStart(dragStart('a')))
      act(() => result.current.clearActive())

      act(() => result.current.handleDragEnd(dragEnd('a', 'c')))

      expect(reorderMutate).not.toHaveBeenCalled()
      expect(placeMutate).not.toHaveBeenCalled()
    })
  })

  // Dragging is disabled whenever rows are hidden, because a row's position
  // relative to what it cannot see is ambiguous.
  describe('the filtered read-only view', () => {
    it('allows dragging when nothing is hidden', () => {
      const { result } = render({ data: board(['a', 'b']) })

      expect(result.current.filtering).toBe(false)
    })

    it('switches to the static view while a search is active', () => {
      const { result } = render({
        data: board(['a', 'b']),
        search: 'nothing matches',
      })

      expect(result.current.filtering).toBe(true)
      expect(result.current.placedView).toEqual([])
    })

    it('switches to the static view when the toggle hides rows', () => {
      const data = {
        placed: [
          ...ranked(['a']),
          ...ranked(['unrated']).map((e) => ({
            ...e,
            level: level({ isRated: false }),
          })),
        ],
        unplaced: [],
      } as ClassicRankingResponse
      const { result } = render({ data, showUnrated: false })

      expect(result.current.filtering).toBe(true)
      expect(result.current.placedView.map((e) => e.levelProgressId)).toEqual([
        'a',
      ])
    })

    it('narrows the placed view to what matches', () => {
      const data = {
        placed: ranked(['a', 'b'], (id) => ({
          level: level({ name: id === 'a' ? 'Bloodbath' : 'Cataclysm' }),
        })),
        unplaced: [],
      } as ClassicRankingResponse
      const { result } = render({ data, search: 'blood' })

      expect(result.current.placedView.map((e) => e.levelProgressId)).toEqual([
        'a',
      ])
    })
  })

  describe('the unplaced view', () => {
    const withNames = (names: Record<string, string>) =>
      ({
        placed: ranked(['p']),
        unplaced: Object.entries(names).map(([id, name]) =>
          unplaced({ levelProgressId: id, level: level({ name }) })
        ),
      }) as ClassicRankingResponse

    it('lists everything with no search', () => {
      const { result } = render({ data: board(['a'], ['x', 'y']) })

      expect(result.current.unplacedView).toEqual(['x', 'y'])
    })

    // The unplaced panel has its own search box, separate from the ranked
    // list's — it narrows the pile whether or not the board is filtering.
    it('narrows the pile on its own search box', () => {
      const { result } = render({
        data: withNames({ x: 'Bloodbath', y: 'Cataclysm' }),
        unplacedSearch: 'blood',
      })

      expect(result.current.unplacedView).toEqual(['x'])
    })

    it('narrows the pile while the board is filtering too', () => {
      const { result } = render({
        data: withNames({ x: 'Bloodbath', y: 'Cataclysm' }),
        search: 'anything',
        unplacedSearch: 'blood',
      })

      expect(result.current.filtering).toBe(true)
      expect(result.current.unplacedView).toEqual(['x'])
    })

    // While dragging, the pile has to be read from the live container so an
    // item mid-move is not dropped from the list under the cursor.
    it('reads the live container while not filtering', () => {
      const { result } = render({ data: board(['a'], ['x', 'y']) })

      act(() => result.current.handleDragOver(dragOver('x', 'placed')))

      expect(result.current.unplacedView).toEqual(['y'])
    })

    it('matches on creator and in-game id too', () => {
      const data = {
        placed: ranked(['p']),
        unplaced: [
          unplaced({
            levelProgressId: 'x',
            level: level({ creator: 'Riot', inGameId: '10' }),
          }),
          unplaced({
            levelProgressId: 'y',
            level: level({ creator: 'Ggb0y', inGameId: '20' }),
          }),
        ],
      } as ClassicRankingResponse

      expect(
        render({ data, unplacedSearch: 'riot' }).result.current.unplacedView
      ).toEqual(['x'])
      expect(
        render({ data, unplacedSearch: '20' }).result.current.unplacedView
      ).toEqual(['y'])
    })
  })

  // The X button on a ranked row. Unlike the drag path it has no dragOver to
  // move the item between containers first, so the hook has to do it — the
  // resync effect is frozen while a rankingReorder mutation is pending.
  describe('removing a row with the X button', () => {
    it('unplaces it', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      act(() => result.current.removeFromRanking('b'))

      expect(unplaceMutate).toHaveBeenCalledWith('b')
    })

    it('drops it out of the ranked column straight away', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      act(() => result.current.removeFromRanking('b'))

      expect(result.current.containers.placed).toEqual(['a', 'c'])
    })

    it('shows it at the top of the unplaced pile straight away', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      act(() => result.current.removeFromRanking('b'))

      expect(result.current.containers.unplaced).toEqual(['b', 'x'])
    })

    it('writes nothing for an id that is not placed', () => {
      const { result } = render({ data: board(['a'], ['x']) })

      act(() => result.current.removeFromRanking('x'))
      act(() => result.current.removeFromRanking('nope'))

      expect(unplaceMutate).not.toHaveBeenCalled()
      expect(result.current.containers).toEqual({
        placed: ['a'],
        unplaced: ['x'],
      })
    })

    // Removal does not depend on a row's position, so unlike reordering it
    // stays available in the static view a search puts the board into.
    it('still removes while the board is filtering', () => {
      const { result } = render({
        data: board(['a', 'b']),
        search: 'nothing matches',
      })

      expect(result.current.filtering).toBe(true)
      act(() => result.current.removeFromRanking('a'))

      expect(unplaceMutate).toHaveBeenCalledWith('a')
    })
  })
})
