import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBoundInputs, type Bounds } from '../useBoundInputs'

const NONE: Bounds = { min: undefined, max: undefined }

function render(initial: Bounds = NONE, exact = false) {
  const onChange = vi.fn()
  const view = renderHook(
    ({ value }: { value: Bounds }) =>
      useBoundInputs({
        value,
        onChange,
        parse: (t) => (/^\d+$/.test(t) ? Number(t) : null),
        format: (v) => `#${v}`,
        describe: (min, max) => `${min ?? '…'} to ${max ?? '…'}`,
        hint: 'How it works',
        invalidMessage: 'Not a number',
        exact,
      }),
    { initialProps: { value: initial } }
  )
  return { ...view, onChange }
}

describe('useBoundInputs', () => {
  // The old boxes showed "Any", which had to be deleted before typing.
  it('shows an unset end as an empty box, not a word to delete', () => {
    const { result } = render()

    expect(result.current.text('min')).toBe('')
    expect(result.current.text('max')).toBe('')
  })

  it('shows a set end formatted', () => {
    expect(render({ min: 5, max: undefined }).result.current.text('min')).toBe(
      '#5'
    )
  })

  it('holds typed text verbatim', () => {
    const { result } = render()

    act(() => result.current.edit('min', '12'))

    expect(result.current.text('min')).toBe('12')
  })

  it('commits a typed value', () => {
    const { result, onChange } = render()

    act(() => result.current.edit('min', '12'))
    act(() => result.current.commit('min'))

    expect(onChange).toHaveBeenCalledWith({ min: 12, max: undefined })
  })

  it('clears an end when its box is emptied', () => {
    const { result, onChange } = render({ min: 5, max: 9 })

    act(() => result.current.edit('min', '  '))
    act(() => result.current.commit('min'))

    expect(onChange).toHaveBeenCalledWith({ min: undefined, max: 9 })
  })

  // Throwing an unreadable entry away silently left people unsure whether the
  // filter had taken; it stays on screen, flagged, until fixed.
  it('keeps and flags an unreadable entry', () => {
    const { result, onChange } = render()

    act(() => result.current.edit('max', 'abc'))
    act(() => result.current.commit('max'))

    expect(onChange).not.toHaveBeenCalled()
    expect(result.current.text('max')).toBe('abc')
    expect(result.current.invalid).toBe('max')
    expect(result.current.tone).toBe('error')
    expect(result.current.message).toBe('Not a number')
  })

  it('drops the flag once the user types again', () => {
    const { result } = render()
    act(() => result.current.edit('max', 'abc'))
    act(() => result.current.commit('max'))

    act(() => result.current.edit('max', '1'))

    expect(result.current.invalid).toBeNull()
  })

  it('flips a range typed backwards', () => {
    const { result, onChange } = render({ min: undefined, max: 10 })

    act(() => result.current.edit('min', '50'))
    act(() => result.current.commit('min'))

    expect(onChange).toHaveBeenCalledWith({ min: 10, max: 50 })
  })

  it('reports nothing when the value did not change', () => {
    const { result, onChange } = render({ min: 5, max: undefined })

    act(() => result.current.edit('min', '5'))
    act(() => result.current.commit('min'))

    expect(onChange).not.toHaveBeenCalled()
    expect(result.current.text('min')).toBe('#5')
  })

  it('ignores a blur with no typing behind it', () => {
    const { result, onChange } = render()

    act(() => result.current.commit('min'))

    expect(onChange).not.toHaveBeenCalled()
  })

  // Between the commit and the URL catching up, the box must not flash back to
  // the old figure.
  it('keeps showing the committed value until it lands', () => {
    const { result } = render()

    act(() => result.current.edit('min', '12'))
    act(() => result.current.commit('min'))

    expect(result.current.text('min')).toBe('#12')
  })

  it('follows the value once it lands, and any later outside change', () => {
    const { result, rerender } = render()
    act(() => result.current.edit('min', '12'))
    act(() => result.current.commit('min'))

    rerender({ value: { min: 12, max: undefined } })
    expect(result.current.text('min')).toBe('#12')

    // "Clear all" from the panel header.
    rerender({ value: NONE })
    expect(result.current.text('min')).toBe('')
  })

  it('throws the typing away on revert', () => {
    const { result, onChange } = render()

    act(() => result.current.edit('min', '99'))
    act(() => result.current.revert('min'))

    expect(result.current.text('min')).toBe('')
    expect(onChange).not.toHaveBeenCalled()
  })

  describe('in Exact mode', () => {
    it('sets both ends to the one value typed', () => {
      const { result, onChange } = render(NONE, true)

      act(() => result.current.edit('min', '22'))
      act(() => result.current.commit('min'))

      expect(onChange).toHaveBeenCalledWith({ min: 22, max: 22 })
    })

    it('clears both ends when the box is emptied', () => {
      const { result, onChange } = render({ min: 22, max: 22 }, true)

      act(() => result.current.edit('min', ''))
      act(() => result.current.commit('min'))

      expect(onChange).toHaveBeenCalledWith({ min: undefined, max: undefined })
    })
  })

  describe('the line under the boxes', () => {
    it('explains the filter while nothing is set', () => {
      const { result } = render()

      expect(result.current.tone).toBe('hint')
      expect(result.current.message).toBe('How it works')
    })

    it('says what a set filter matches', () => {
      const { result } = render({ min: 5, max: undefined })

      expect(result.current.tone).toBe('summary')
      expect(result.current.message).toBe('5 to …')
    })
  })

  it('gives each box and the message their own ids', () => {
    const { ids } = render().result.current

    expect(new Set([ids.min, ids.max, ids.message]).size).toBe(3)
  })
})
