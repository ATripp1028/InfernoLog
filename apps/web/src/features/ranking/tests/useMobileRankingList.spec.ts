import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassicRankingResponse } from '@infernolog/core'
import { stubMutation } from '@/utils/testUtils'
import { level, ranked, unplaced } from './fixtures'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/api/ranking', () => ({
  usePlaceRanking: vi.fn(),
  useReorderRanking: vi.fn(),
}))

const { toast } = await import('@/components/generic/sonner')
const { usePlaceRanking, useReorderRanking } = await import('@/lib/api/ranking')
const { useMobileRankingList } = await import('../useMobileRankingList')

let placeMutate: ReturnType<typeof vi.fn>
let reorderMutate: ReturnType<typeof vi.fn>

beforeEach(() => {
  placeMutate = vi.fn()
  reorderMutate = vi.fn()
  vi.mocked(usePlaceRanking).mockReturnValue(
    stubMutation({ mutate: placeMutate })
  )
  vi.mocked(useReorderRanking).mockReturnValue(
    stubMutation({ mutate: reorderMutate })
  )
})

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
  } = {}
) {
  return renderHook(() =>
    useMobileRankingList({
      data: opts.data ?? board(['a', 'b', 'c']),
      search: opts.search ?? '',
      showUnrated: opts.showUnrated ?? true,
    })
  )
}

describe('useMobileRankingList', () => {
  describe('edit mode', () => {
    it('starts off', () => {
      const { result } = render()

      expect(result.current.editMode).toBe(false)
      expect(result.current.canEdit).toBe(false)
    })

    it('toggles on and off', () => {
      const { result } = render()

      act(() => result.current.toggleEditMode())
      expect(result.current.editMode).toBe(true)
      expect(result.current.canEdit).toBe(true)

      act(() => result.current.toggleEditMode())
      expect(result.current.editMode).toBe(false)
    })

    // Editing is withheld whenever rows are hidden, for the same reason drag
    // is disabled on desktop: a row's position relative to what it cannot see
    // is ambiguous.
    it('cannot edit while a search is hiding rows', () => {
      const { result } = render({ search: 'nothing matches' })
      act(() => result.current.toggleEditMode())

      expect(result.current.editMode).toBe(true)
      expect(result.current.filtering).toBe(true)
      expect(result.current.canEdit).toBe(false)
    })

    it('cannot edit while the unrated toggle is hiding rows', () => {
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
      act(() => result.current.toggleEditMode())

      expect(result.current.canEdit).toBe(false)
    })
  })

  // ↑/↓ stand in for drag-and-drop, which touch does not offer.
  describe('nudging a row', () => {
    it('moves a row up, sending the neighbours around where it lands', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      act(() => result.current.move('b', 'up'))

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'b',
        belowId: 'a',
      })
    })

    it('moves a row down', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      act(() => result.current.move('b', 'down'))

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'b',
        aboveId: 'c',
      })
    })

    it('sends both neighbours for a move into the middle', () => {
      const { result } = render({ data: board(['a', 'b', 'c', 'd']) })

      act(() => result.current.move('d', 'up'))

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'd',
        aboveId: 'b',
        belowId: 'c',
      })
    })

    // The ends have nowhere to go, so the button is a no-op rather than a
    // write that would reorder nothing.
    it('does nothing moving the top row up', () => {
      const { result } = render({ data: board(['a', 'b']) })

      act(() => result.current.move('a', 'up'))

      expect(reorderMutate).not.toHaveBeenCalled()
    })

    it('does nothing moving the bottom row down', () => {
      const { result } = render({ data: board(['a', 'b']) })

      act(() => result.current.move('b', 'down'))

      expect(reorderMutate).not.toHaveBeenCalled()
    })

    it('does nothing for a row that is not in the list', () => {
      const { result } = render({ data: board(['a', 'b']) })

      act(() => result.current.move('ghost', 'up'))

      expect(reorderMutate).not.toHaveBeenCalled()
    })
  })

  // The # button jumps a row straight to a typed rank.
  describe('jumping to a rank', () => {
    const jumpTo = (
      result: { current: ReturnType<typeof useMobileRankingList> },
      id: string,
      value: string
    ) => {
      act(() => result.current.setJumpFor(id))
      act(() => result.current.setJumpValue(value))
      act(() => result.current.submitJump(id))
    }

    it('moves the row to the typed rank', () => {
      const { result } = render({ data: board(['a', 'b', 'c', 'd']) })

      jumpTo(result, 'd', '2')

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'd',
        aboveId: 'a',
        belowId: 'b',
      })
    })

    it('jumps a row to the very top', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      jumpTo(result, 'c', '1')

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'c',
        belowId: 'a',
      })
    })

    // A wild number lands at the nearest end rather than doing nothing.
    it.each([
      ['above the list', '999'],
      ['at the exact bottom', '3'],
    ])('clamps a rank %s to the last position', (_label, value) => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      jumpTo(result, 'a', value)

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'a',
        aboveId: 'c',
      })
    })

    it('clamps a rank below the list to the top', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      jumpTo(result, 'c', '0')

      expect(reorderMutate).toHaveBeenCalledWith({
        levelProgressId: 'c',
        belowId: 'a',
      })
    })

    it('does nothing when the row is already at that rank', () => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      jumpTo(result, 'b', '2')

      expect(reorderMutate).not.toHaveBeenCalled()
    })

    it.each([
      ['unparseable text', 'abc'],
      ['nothing at all', ''],
    ])('does nothing for %s', (_label, value) => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      jumpTo(result, 'a', value)

      expect(reorderMutate).not.toHaveBeenCalled()
    })

    // The prompt closes and clears whatever was typed, valid or not.
    it.each([
      ['a valid jump', '1'],
      ['an invalid one', 'abc'],
    ])('closes and clears the prompt after %s', (_label, value) => {
      const { result } = render({ data: board(['a', 'b', 'c']) })

      jumpTo(result, 'c', value)

      expect(result.current.jumpFor).toBeNull()
      expect(result.current.jumpValue).toBe('')
    })

    it('tracks which row the prompt is open for', () => {
      const { result } = render()

      act(() => result.current.setJumpFor('b'))

      expect(result.current.jumpFor).toBe('b')
    })
  })

  // No drag-and-drop on touch, so a tapped level drops in at #1 and the user
  // nudges it from there.
  describe('placing from the unplaced sheet', () => {
    it('places the level above the current #1', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      act(() => result.current.placeFromUnplaced('x'))

      expect(placeMutate).toHaveBeenCalledWith({
        levelProgressId: 'x',
        belowId: 'a',
      })
    })

    // With nothing placed yet there is no neighbour to send.
    it('omits the neighbour for the first level ever placed', () => {
      const { result } = render({ data: board([], ['x']) })

      act(() => result.current.placeFromUnplaced('x'))

      expect(placeMutate).toHaveBeenCalledWith({ levelProgressId: 'x' })
    })

    it('closes the sheet and turns edit mode on', () => {
      const { result } = render({ data: board(['a'], ['x']) })
      act(() => result.current.setUnplacedOpen(true))

      act(() => result.current.placeFromUnplaced('x'))

      expect(result.current.unplacedOpen).toBe(false)
      expect(result.current.editMode).toBe(true)
    })

    // The level lands somewhere arbitrary, so the toast says how to move it.
    it('tells the user how to move it from there', () => {
      const { result } = render({ data: board(['a'], ['x']) })

      act(() => result.current.placeFromUnplaced('x'))

      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Placed at #1')
      )
    })
  })

  describe('the views', () => {
    it('lists the placed rows and the unplaced pile', () => {
      const { result } = render({ data: board(['a', 'b'], ['x']) })

      expect(result.current.view.map((e) => e.levelProgressId)).toEqual([
        'a',
        'b',
      ])
      expect(result.current.unplacedView.map((e) => e.levelProgressId)).toEqual(
        ['x']
      )
    })

    // One search box drives both lists on mobile, unlike desktop's two.
    it('narrows both lists on the same search', () => {
      const data = {
        placed: ranked(['a'], () => ({ level: level({ name: 'Bloodbath' }) })),
        unplaced: [
          unplaced({
            levelProgressId: 'x',
            level: level({ name: 'Bloodbath II' }),
          }),
          unplaced({
            levelProgressId: 'y',
            level: level({ name: 'Cataclysm' }),
          }),
        ],
      } as ClassicRankingResponse
      const { result } = render({ data, search: 'blood' })

      expect(result.current.view).toHaveLength(1)
      expect(result.current.unplacedView.map((e) => e.levelProgressId)).toEqual(
        ['x']
      )
    })
  })
})
