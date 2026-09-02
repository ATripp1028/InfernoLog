import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { DragEndEvent } from '@dnd-kit/core'
import { unrankedDragId, useManualBoard } from '../useManualBoard'
import { makeLevel, makeListItem } from '@/utils/testUtils'

const place = vi.fn()
const reorder = vi.fn()

vi.mock('@/lib/api/ratingRanking', () => ({
  usePlaceRating: () => ({ mutate: place, isPending: false }),
  useReorderRating: () => ({ mutate: reorder, isPending: false }),
}))
vi.mock('@/components/generic/sonner', () => ({ toast: { error: vi.fn() } }))

const item = (id: string) =>
  makeListItem({
    levelProgressId: `lp-${id}`,
    level: makeLevel({ inGameId: id }),
    overallRating: null,
  })

const entries = ['a', 'b', 'c'].map((id, i) => ({ rank: i + 1, item: item(id) }))
const pile = [item('new')]

const drop = (activeId: string, overId: string) =>
  ({ active: { id: activeId }, over: { id: overId } }) as unknown as DragEndEvent

function board() {
  return renderHook(() => useManualBoard({ entries, unranked: pile })).result
}

describe('useManualBoard', () => {
  it('renumbers the rows it renders', () => {
    expect(board().current.rows.map((r) => r.rank)).toEqual([1, 2, 3])
  })

  // Neighbour-based, not index-based: the server owns the fractional indices
  // and may renormalise the whole list, so the client can only say "between
  // these two rows".
  it('reorders by naming the new neighbours', () => {
    const b = board()

    act(() => b.current.handleDragEnd(drop('lp-a', 'lp-c')))

    // a lands last, so the row above it is c and nothing is below.
    expect(reorder).toHaveBeenCalledWith(
      { levelProgressId: 'lp-a', aboveId: 'lp-c' },
      expect.anything()
    )
  })

  it('places an unranked completion where it was dropped', () => {
    const b = board()

    act(() => b.current.handleDragEnd(drop(unrankedDragId('lp-new'), 'lp-b')))

    // Lands at b's index: a above it, b below.
    expect(place).toHaveBeenCalledWith(
      { levelProgressId: 'lp-new', aboveId: 'lp-a', belowId: 'lp-b' },
      expect.anything()
    )
  })

  it('shows the new order immediately, before the server answers', () => {
    const b = board()

    act(() => b.current.handleDragEnd(drop('lp-a', 'lp-c')))

    expect(b.current.rows.map((r) => r.item.levelProgressId)).toEqual([
      'lp-b',
      'lp-c',
      'lp-a',
    ])
  })

  it('does nothing when a row is dropped on itself', () => {
    const b = board()
    reorder.mockClear()

    act(() => b.current.handleDragEnd(drop('lp-a', 'lp-a')))

    expect(reorder).not.toHaveBeenCalled()
  })

  it('does nothing when a drag ends outside any target', () => {
    const b = board()
    reorder.mockClear()

    act(() =>
      b.current.handleDragEnd({
        active: { id: 'lp-a' },
        over: null,
      } as unknown as DragEndEvent)
    )

    expect(reorder).not.toHaveBeenCalled()
  })
})
