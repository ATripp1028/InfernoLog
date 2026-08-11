import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import {
  useListMergeBoard,
  type ListMergeEntry,
} from '../listMerge/useListMergeBoard'

const entry = (levelId: string): ListMergeEntry => ({
  levelId,
  levelName: `Level ${levelId}`,
})

const render = (input: Partial<Parameters<typeof useListMergeBoard>[0]> = {}) =>
  renderHook(() =>
    useListMergeBoard({
      mergedSeed: [],
      importedRemainder: [],
      existingRemainder: [],
      importedOrder: [],
      existingOrder: [],
      ...input,
    })
  )

const dragOver = (activeId: string, overId: string) =>
  ({ active: { id: activeId }, over: { id: overId } }) as DragOverEvent

const dragEnd = (activeId: string, overId: string | null) =>
  ({
    active: { id: activeId },
    over: overId == null ? null : { id: overId },
  }) as DragEndEvent

describe('useListMergeBoard', () => {
  describe('the three columns', () => {
    it('seeds the middle with what the server already merged', () => {
      const { result } = render({ mergedSeed: [entry('1'), entry('2')] })

      expect(result.current.containers.middle).toEqual(['1', '2'])
      expect(result.current.containers.left).toEqual([])
      expect(result.current.containers.right).toEqual([])
    })

    it('puts each side of the disagreement in its own column', () => {
      const { result } = render({
        importedRemainder: [entry('a')],
        existingRemainder: [entry('b')],
      })

      expect(result.current.containers.left).toEqual(['a'])
      expect(result.current.containers.right).toEqual(['b'])
    })

    // dnd-kit needs unique ids per drag context, so a level in BOTH remainders
    // can only be draggable once: the left column owns it, and the right shows
    // a non-interactive reference card at the same identity.
    it('keeps a contested entry draggable only on the left', () => {
      const { result } = render({
        importedRemainder: [entry('shared'), entry('a')],
        existingRemainder: [entry('shared'), entry('b')],
      })

      expect(result.current.containers.left).toEqual(['shared', 'a'])
      expect(result.current.containers.right).toEqual(['b'])
    })

    it('surfaces the contested entry as a reference card', () => {
      const { result } = render({
        importedRemainder: [entry('shared')],
        existingRemainder: [entry('shared'), entry('b')],
      })

      expect(
        result.current.contestedReferenceCards.map((e) => e.levelId)
      ).toEqual(['shared'])
    })

    it('resolves an entry from either full ordering', () => {
      const { result } = render({
        importedOrder: [entry('x')],
        existingOrder: [entry('y')],
      })

      expect(result.current.entriesById.get('x')).toEqual(entry('x'))
      expect(result.current.entriesById.get('y')).toEqual(entry('y'))
    })
  })

  describe('dragging between columns', () => {
    it('moves an entry into the column it was dropped over', () => {
      const { result } = render({
        importedRemainder: [entry('a')],
        mergedSeed: [entry('1')],
      })

      act(() => result.current.handleDragOver(dragOver('a', 'middle')))

      expect(result.current.containers.left).toEqual([])
      expect(result.current.containers.middle).toEqual(['1', 'a'])
    })

    it('inserts at the position of the entry it was dropped over', () => {
      const { result } = render({
        importedRemainder: [entry('a')],
        mergedSeed: [entry('1'), entry('2')],
      })

      act(() => result.current.handleDragOver(dragOver('a', '1')))

      expect(result.current.containers.middle).toEqual(['a', '1', '2'])
    })

    // Dropping on the column itself, rather than on a card, means "the end".
    it('appends when dropped on an empty column', () => {
      const { result } = render({ importedRemainder: [entry('a')] })

      act(() => result.current.handleDragOver(dragOver('a', 'right')))

      expect(result.current.containers.right).toEqual(['a'])
    })

    it('ignores a move within one column', () => {
      const { result } = render({ mergedSeed: [entry('1'), entry('2')] })

      act(() => result.current.handleDragOver(dragOver('1', '2')))

      expect(result.current.containers.middle).toEqual(['1', '2'])
    })

    it('ignores a drag over nothing', () => {
      const { result } = render({ importedRemainder: [entry('a')] })

      act(() =>
        result.current.handleDragOver({
          active: { id: 'a' },
          over: null,
        } as DragOverEvent)
      )

      expect(result.current.containers.left).toEqual(['a'])
    })

    it('ignores an unknown id', () => {
      const { result } = render({ mergedSeed: [entry('1')] })

      act(() => result.current.handleDragOver(dragOver('ghost', 'middle')))

      expect(result.current.containers.middle).toEqual(['1'])
    })
  })

  describe('reordering the merged column', () => {
    it('reorders within the middle on drop', () => {
      const { result } = render({
        mergedSeed: [entry('1'), entry('2'), entry('3')],
      })

      act(() => result.current.handleDragEnd(dragEnd('1', '3')))

      expect(result.current.containers.middle).toEqual(['2', '3', '1'])
    })

    // Only the middle column is ordered — it IS the final order. The side
    // columns are holding pens, so their internal order is meaningless.
    it('does not reorder a side column', () => {
      const { result } = render({
        importedRemainder: [entry('a'), entry('b')],
      })

      act(() => result.current.handleDragEnd(dragEnd('a', 'b')))

      expect(result.current.containers.left).toEqual(['a', 'b'])
    })

    it('ignores a drop on itself', () => {
      const { result } = render({ mergedSeed: [entry('1'), entry('2')] })

      act(() => result.current.handleDragEnd(dragEnd('1', '1')))

      expect(result.current.containers.middle).toEqual(['1', '2'])
    })

    it('ignores a drop outside any column', () => {
      const { result } = render({ mergedSeed: [entry('1'), entry('2')] })

      act(() => result.current.handleDragEnd(dragEnd('1', null)))

      expect(result.current.containers.middle).toEqual(['1', '2'])
    })
  })

  describe('drag overlay state', () => {
    it('tracks the dragged entry', () => {
      const { result } = render({ mergedSeed: [entry('1')] })

      act(() =>
        result.current.handleDragStart({
          active: { id: '1' },
        } as DragStartEvent)
      )

      expect(result.current.activeId).toBe('1')
      expect(result.current.activeEntry).toEqual(entry('1'))
    })

    it('clears it on drop', () => {
      const { result } = render({ mergedSeed: [entry('1'), entry('2')] })
      act(() =>
        result.current.handleDragStart({
          active: { id: '1' },
        } as DragStartEvent)
      )

      act(() => result.current.handleDragEnd(dragEnd('1', '2')))

      expect(result.current.activeId).toBeNull()
      expect(result.current.activeEntry).toBeNull()
    })

    it('clears it on cancel', () => {
      const { result } = render({ mergedSeed: [entry('1')] })
      act(() =>
        result.current.handleDragStart({
          active: { id: '1' },
        } as DragStartEvent)
      )

      act(() => result.current.clearActive())

      expect(result.current.activeId).toBeNull()
    })
  })

  // Reconciling by hand means holding both orders in your head at once, which
  // stops being practical past a handful of entries.
  describe('the bulk escape hatches', () => {
    it('takes one side wholesale, emptying both holding columns', () => {
      const { result } = render({
        importedRemainder: [entry('a')],
        existingRemainder: [entry('b')],
        importedOrder: [entry('a'), entry('1')],
      })

      act(() => result.current.applyWholeOrder([entry('a'), entry('1')]))

      expect(result.current.containers).toEqual({
        left: [],
        middle: ['a', '1'],
        right: [],
      })
    })

    it('opens the confirm gate, since nothing is left unplaced', () => {
      const { result } = render({ importedRemainder: [entry('a')] })

      act(() => result.current.applyWholeOrder([entry('a')]))

      expect(result.current.unplacedCount).toBe(0)
      expect(result.current.canConfirm).toBe(true)
    })

    // Applying a whole order supersedes an earlier acknowledgement — nothing
    // is being voided any more, so the checkbox must not stay ticked.
    it('clears a previous void acknowledgement', () => {
      const { result } = render({ importedRemainder: [entry('a')] })
      act(() => result.current.setAcknowledgeVoid(true))

      act(() => result.current.applyWholeOrder([entry('a')]))

      expect(result.current.acknowledgeVoid).toBe(false)
    })
  })

  describe('the confirm gate', () => {
    it('is open when there was nothing to reconcile', () => {
      const { result } = render({ mergedSeed: [entry('1')] })

      expect(result.current.unplacedCount).toBe(0)
      expect(result.current.canConfirm).toBe(true)
    })

    // Anything left in a side column is dropped from the final order, so the
    // user has to say they meant it.
    it('is shut while entries are still unplaced', () => {
      const { result } = render({
        importedRemainder: [entry('a')],
        existingRemainder: [entry('b')],
      })

      expect(result.current.unplacedCount).toBe(2)
      expect(result.current.canConfirm).toBe(false)
    })

    it('opens once the unplaced entries are acknowledged', () => {
      const { result } = render({ importedRemainder: [entry('a')] })

      act(() => result.current.setAcknowledgeVoid(true))

      expect(result.current.canConfirm).toBe(true)
      expect(result.current.unplacedCount).toBe(1)
    })

    it('opens once every entry is dragged into the merged column', () => {
      const { result } = render({ importedRemainder: [entry('a')] })

      act(() => result.current.handleDragOver(dragOver('a', 'middle')))

      expect(result.current.unplacedCount).toBe(0)
      expect(result.current.canConfirm).toBe(true)
    })

    it('counts a contested entry once, not twice', () => {
      const { result } = render({
        importedRemainder: [entry('shared')],
        existingRemainder: [entry('shared')],
      })

      expect(result.current.unplacedCount).toBe(1)
    })
  })

  // The middle column IS the answer handed back to useListMergeResolution.
  describe('the final order', () => {
    it('is the merged column, in its current order', () => {
      const { result } = render({ mergedSeed: [entry('1'), entry('2')] })

      expect(result.current.finalOrder).toEqual(['1', '2'])

      act(() => result.current.handleDragEnd(dragEnd('1', '2')))

      expect(result.current.finalOrder).toEqual(['2', '1'])
    })

    it('excludes anything left in a side column', () => {
      const { result } = render({
        mergedSeed: [entry('1')],
        importedRemainder: [entry('a')],
      })

      expect(result.current.finalOrder).toEqual(['1'])
    })
  })
})
