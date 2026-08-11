import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListPreset } from '@/lib/api/presets'
import { getPresetColor } from '../presets'
import { usePresetSelector } from '../usePresetSelector'

const preset = (id: string, name = id): ListPreset =>
  ({ id, name, color: 'blue', description: null }) as ListPreset

/** A mouse event carrying the bounding box the hover card positions against. */
const mouseEvent = () =>
  ({
    stopPropagation: vi.fn(),
    currentTarget: {
      getBoundingClientRect: () => ({ top: 10, left: 20 }) as DOMRect,
    },
  }) as unknown as React.MouseEvent

describe('usePresetSelector', () => {
  const render = (
    opts: {
      presets?: ListPreset[]
      selectedPresetId?: string | null
      deletingPresetId?: string | null
      overwritingPresetIds?: string[]
    } = {}
  ) => {
    const handlers = {
      onSelect: vi.fn(),
      onOverwrite: vi.fn(),
      onDelete: vi.fn(),
      onEdit: vi.fn(),
    }
    const view = renderHook(
      ({ deletingPresetId }: { deletingPresetId: string | null }) =>
        usePresetSelector({
          presets: opts.presets ?? [preset('p1', 'Extremes')],
          selectedPresetId: opts.selectedPresetId ?? null,
          deletingPresetId,
          overwritingPresetIds: opts.overwritingPresetIds ?? [],
          ...handlers,
        }),
      { initialProps: { deletingPresetId: opts.deletingPresetId ?? null } }
    )
    return { ...view, ...handlers }
  }

  describe('the trigger', () => {
    it('reads Default when no preset is active', () => {
      const { result } = render()

      expect(result.current.triggerLabel).toBe('Default')
      expect(result.current.triggerColor).toBeNull()
      expect(result.current.selectedPreset).toBeUndefined()
    })

    it('names and colours the active preset', () => {
      const { result } = render({ selectedPresetId: 'p1' })

      expect(result.current.triggerLabel).toBe('Extremes')
      expect(result.current.triggerColor).toBe(getPresetColor('blue'))
    })

    // A preset deleted in another tab leaves an id pointing at nothing.
    it('falls back to Default for an id that no longer exists', () => {
      const { result } = render({ selectedPresetId: 'gone' })

      expect(result.current.triggerLabel).toBe('Default')
    })
  })

  describe('selecting', () => {
    it('selects a preset and closes the dropdown', () => {
      const { result, onSelect } = render()
      act(() => result.current.handleOpenChange(true))

      act(() => result.current.handleSelect('p1'))

      expect(onSelect).toHaveBeenCalledWith('p1')
      expect(result.current.open).toBe(false)
    })

    it('selects the Default view', () => {
      const { result, onSelect } = render()

      act(() => result.current.handleSelect(null))

      expect(onSelect).toHaveBeenCalledWith(null)
    })

    // Selecting elsewhere abandons a delete the user had armed.
    it('cancels an armed delete', () => {
      const { result } = render()
      act(() => result.current.handleDeleteClick('p1', mouseEvent()))

      act(() => result.current.handleSelect('p1'))

      expect(result.current.pendingDeleteId).toBeNull()
    })
  })

  describe('overwriting', () => {
    it('overwrites the active preset and closes', () => {
      const { result, onOverwrite } = render({ selectedPresetId: 'p1' })
      act(() => result.current.handleOpenChange(true))

      act(() => result.current.handleOverwrite())

      expect(onOverwrite).toHaveBeenCalledWith('p1')
      expect(result.current.open).toBe(false)
    })

    // There is nothing to overwrite on the built-in Default view.
    it('does nothing on the Default view', () => {
      const { result, onOverwrite } = render({ selectedPresetId: null })

      act(() => result.current.handleOverwrite())

      expect(onOverwrite).not.toHaveBeenCalled()
    })

    // Derived from the in-flight mutation list rather than local state, so two
    // concurrent overwrites cannot clear each other's spinner.
    it('reports an in-flight overwrite of the active preset', () => {
      const { result } = render({
        selectedPresetId: 'p1',
        overwritingPresetIds: ['p1'],
      })

      expect(result.current.isOverwriting).toBe(true)
    })

    it('ignores an in-flight overwrite of a different preset', () => {
      const { result } = render({
        selectedPresetId: 'p1',
        overwritingPresetIds: ['p2'],
      })

      expect(result.current.isOverwriting).toBe(false)
    })
  })

  describe('the inline delete confirmation', () => {
    it('arms the confirmation without deleting yet', () => {
      const { result, onDelete } = render()

      act(() => result.current.handleDeleteClick('p1', mouseEvent()))

      expect(result.current.pendingDeleteId).toBe('p1')
      expect(onDelete).not.toHaveBeenCalled()
    })

    // The delete button sits inside a selectable row, so the click must not
    // also select that row.
    it('stops the click reaching the row', () => {
      const { result } = render()
      const e = mouseEvent()

      act(() => result.current.handleDeleteClick('p1', e))

      expect(e.stopPropagation).toHaveBeenCalled()
    })

    it('clears the hover card while confirming', () => {
      const { result } = render()
      act(() => result.current.handleOptionEnter(mouseEvent(), 'p1'))

      act(() => result.current.handleDeleteClick('p1', mouseEvent()))

      expect(result.current.hoveredId).toBeNull()
    })

    it('deletes on confirm', () => {
      const { result, onDelete } = render()
      act(() => result.current.handleDeleteClick('p1', mouseEvent()))

      act(() => result.current.handleConfirmDelete('p1'))

      expect(onDelete).toHaveBeenCalledWith('p1')
    })

    // The dropdown stays open through the request so the spinner is visible,
    // then closes itself once the deletion finishes.
    it('holds the dropdown open while the delete is in flight', () => {
      const { result, rerender } = render()
      act(() => result.current.handleOpenChange(true))
      act(() => result.current.handleConfirmDelete('p1'))

      rerender({ deletingPresetId: 'p1' })

      expect(result.current.open).toBe(true)
    })

    it('closes once the delete finishes', () => {
      const { result, rerender } = render()
      act(() => result.current.handleOpenChange(true))
      act(() => result.current.handleConfirmDelete('p1'))
      rerender({ deletingPresetId: 'p1' })

      rerender({ deletingPresetId: null })

      expect(result.current.open).toBe(false)
      expect(result.current.pendingDeleteId).toBeNull()
    })

    // Only a delete this selector actually started should close it — an
    // unrelated deletion settling elsewhere must not.
    it('does not close for a delete it never started', () => {
      const { result, rerender } = render({ deletingPresetId: 'other' })
      act(() => result.current.handleOpenChange(true))

      rerender({ deletingPresetId: null })

      expect(result.current.open).toBe(true)
    })

    it('cancels on demand', () => {
      const { result } = render()
      act(() => result.current.handleDeleteClick('p1', mouseEvent()))

      act(() => result.current.cancelDelete())

      expect(result.current.pendingDeleteId).toBeNull()
    })

    it('forgets an armed delete when the dropdown closes', () => {
      const { result } = render()
      act(() => result.current.handleOpenChange(true))
      act(() => result.current.handleDeleteClick('p1', mouseEvent()))

      act(() => result.current.handleOpenChange(false))

      expect(result.current.pendingDeleteId).toBeNull()
    })

    // Closing mid-request must not discard the pending state the settle
    // handler is about to read.
    it('keeps an armed delete when closing with one in flight', () => {
      const { result } = render({ deletingPresetId: 'p1' })
      act(() => result.current.handleDeleteClick('p1', mouseEvent()))

      act(() => result.current.handleOpenChange(false))

      expect(result.current.pendingDeleteId).toBe('p1')
    })
  })

  describe('editing', () => {
    it('closes the dropdown and hands the preset to the editor', () => {
      const target = preset('p1', 'Extremes')
      const { result, onEdit } = render({ presets: [target] })
      act(() => result.current.handleOpenChange(true))

      act(() => result.current.handleEditClick(target, mouseEvent()))

      expect(onEdit).toHaveBeenCalledWith(target)
      expect(result.current.open).toBe(false)
    })

    it('stops the click reaching the row', () => {
      const { result } = render()
      const e = mouseEvent()

      act(() => result.current.handleEditClick(preset('p1'), e))

      expect(e.stopPropagation).toHaveBeenCalled()
    })
  })

  describe('the hover card', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('tracks the hovered row and where it is', () => {
      const { result } = render()

      act(() => result.current.handleOptionEnter(mouseEvent(), 'p1'))

      expect(result.current.hoveredId).toBe('p1')
      expect(result.current.hoverRect).toMatchObject({ top: 10, left: 20 })
      expect(result.current.hoveredPreset?.id).toBe('p1')
    })

    // The Default row has a card but no preset behind it.
    it('resolves no preset for the Default row', () => {
      const { result } = render()

      act(() => result.current.handleOptionEnter(mouseEvent(), 'default'))

      expect(result.current.hoveredId).toBe('default')
      expect(result.current.hoveredPreset).toBeNull()
    })

    // A short grace period on leave stops the card flickering as the pointer
    // crosses the gap between two rows.
    it('does not hide the instant the pointer leaves', () => {
      const { result } = render()
      act(() => result.current.handleOptionEnter(mouseEvent(), 'p1'))

      act(() => result.current.handleOptionLeave())

      expect(result.current.hoveredId).toBe('p1')
    })

    it('hides once the grace period elapses', () => {
      const { result } = render()
      act(() => result.current.handleOptionEnter(mouseEvent(), 'p1'))
      act(() => result.current.handleOptionLeave())

      act(() => vi.advanceTimersByTime(200))

      expect(result.current.hoveredId).toBeNull()
      expect(result.current.hoverRect).toBeNull()
    })

    it('survives the pointer moving straight to another row', () => {
      const { result } = render({
        presets: [preset('p1'), preset('p2')],
      })
      act(() => result.current.handleOptionEnter(mouseEvent(), 'p1'))

      act(() => result.current.handleOptionLeave())
      act(() => result.current.handleOptionEnter(mouseEvent(), 'p2'))
      act(() => vi.advanceTimersByTime(200))

      expect(result.current.hoveredId).toBe('p2')
    })

    it('clears the card when the dropdown closes', () => {
      const { result } = render()
      act(() => result.current.handleOpenChange(true))
      act(() => result.current.handleOptionEnter(mouseEvent(), 'p1'))

      act(() => result.current.handleOpenChange(false))

      expect(result.current.hoveredId).toBeNull()
      expect(result.current.hoverRect).toBeNull()
    })
  })

  it('closes on demand', () => {
    const { result } = render()
    act(() => result.current.handleOpenChange(true))

    act(() => result.current.close())

    expect(result.current.open).toBe(false)
  })
})
