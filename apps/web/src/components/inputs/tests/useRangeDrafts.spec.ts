import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRangeDrafts, type Range } from '../useRangeDrafts'

describe('useRangeDrafts', () => {
  const render = (
    opts: {
      value?: Range
      parseInput?: null
      commitOnRelease?: boolean
    } = {}
  ) => {
    const onChange = vi.fn()
    const view = renderHook(
      ({ value }: { value: Range }) =>
        useRangeDrafts({
          min: 0,
          max: 100,
          value,
          onChange,
          commitOnRelease: opts.commitOnRelease,
          parseInput:
            opts.parseInput === null
              ? undefined
              : (text) => {
                  const n = Number(text)
                  return Number.isNaN(n) ? null : n
                },
        }),
      { initialProps: { value: opts.value ?? [0, 100] } }
    )
    return { ...view, onChange }
  }

  it('starts with no draft, showing the committed value', () => {
    const { result } = render()

    expect(result.current.minDraft).toBeNull()
    expect(result.current.maxDraft).toBeNull()
    expect(result.current.shown).toEqual([0, 100])
  })

  // While typing, the draft is shown verbatim — clamping mid-keystroke would
  // fight the user.
  it('holds the typed text verbatim', () => {
    const { result } = render()

    act(() => result.current.setMinDraft('4'))

    expect(result.current.minDraft).toBe('4')
  })

  it('commits a parsed value and drops the draft', () => {
    const { result, onChange } = render()

    act(() => result.current.commitMin('40'))

    expect(onChange).toHaveBeenCalledWith([40, 100])
    expect(result.current.minDraft).toBeNull()
  })

  it('clamps a commit to the domain', () => {
    const { result, onChange } = render()

    act(() => result.current.commitMin('-20'))
    expect(onChange).toHaveBeenCalledWith([0, 100])

    act(() => result.current.commitMax('200'))
    expect(onChange).toHaveBeenLastCalledWith([0, 100])
  })

  // The two ends cannot cross — a min above the current max is pinned to it.
  it('stops the lower end passing the upper', () => {
    const { result, onChange } = render({ value: [0, 50] })

    act(() => result.current.commitMin('80'))

    expect(onChange).toHaveBeenCalledWith([50, 50])
  })

  it('stops the upper end passing the lower', () => {
    const { result, onChange } = render({ value: [50, 100] })

    act(() => result.current.commitMax('20'))

    expect(onChange).toHaveBeenCalledWith([50, 50])
  })

  // Unparseable input drops the draft, which restores the committed value on
  // the next render rather than writing something wrong.
  it('discards an unparseable commit', () => {
    const { result, onChange } = render()

    act(() => result.current.commitMin('abc'))

    expect(onChange).not.toHaveBeenCalled()
    expect(result.current.minDraft).toBeNull()
  })

  it('writes nothing when the caller supplied no parser', () => {
    const { result, onChange } = render({ parseInput: null })

    act(() => result.current.commitMin('40'))

    expect(onChange).not.toHaveBeenCalled()
  })

  describe('the single-value box', () => {
    it('sets both ends to what was typed', () => {
      const { result, onChange } = render()

      act(() => result.current.commitSingle('40'))

      expect(onChange).toHaveBeenCalledWith([40, 40])
    })

    it('clamps to the domain', () => {
      const { result, onChange } = render()

      act(() => result.current.commitSingle('150'))

      expect(onChange).toHaveBeenCalledWith([100, 100])
    })

    it('discards an unparseable entry', () => {
      const { result, onChange } = render()

      act(() => result.current.commitSingle('abc'))

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('dragging the slider', () => {
    // The Log page filters client-side, so following the thumb live is free.
    it('reports every step of a drag by default', () => {
      const { result, onChange } = render()

      act(() => result.current.slide([10, 100]))
      act(() => result.current.slide([20, 100]))

      expect(onChange).toHaveBeenCalledTimes(2)
      expect(onChange).toHaveBeenLastCalledWith([20, 100])
    })

    // Where each change is a server query, a drag must be one query, not one
    // per step it passed through.
    it('holds a drag locally under commitOnRelease', () => {
      const { result, onChange } = render({ commitOnRelease: true })

      act(() => result.current.slide([10, 100]))

      expect(onChange).not.toHaveBeenCalled()
      expect(result.current.shown).toEqual([10, 100])
    })

    it('commits once, when the thumb is let go', () => {
      const { result, onChange } = render({ commitOnRelease: true })

      act(() => result.current.slide([10, 100]))
      act(() => result.current.slide([20, 100]))
      act(() => result.current.release([20, 100]))

      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith([20, 100])
    })

    // Between the commit and the new value arriving back, snapping the thumb to
    // the old position would read as the drag having been rejected.
    it('keeps the released position on screen until the value lands', () => {
      const { result } = render({ commitOnRelease: true })

      act(() => result.current.slide([20, 100]))
      act(() => result.current.release([20, 100]))

      expect(result.current.shown).toEqual([20, 100])
    })

    it('yields to the value once it changes', () => {
      const { result, rerender } = render({ commitOnRelease: true })
      act(() => result.current.slide([20, 100]))
      act(() => result.current.release([20, 100]))

      // The caller normalized the commit, or something else moved it.
      rerender({ value: [30, 100] })

      expect(result.current.shown).toEqual([30, 100])
    })

    // A filter narrowed to one value draws a single thumb; callers still get
    // a range, just a zero-width one.
    it('reads a one-thumb drag as a single value', () => {
      const { result, onChange } = render()

      act(() => result.current.slide([7]))

      expect(onChange).toHaveBeenCalledWith([7, 7])
    })

    it('commits a one-thumb drag as a single value on release', () => {
      const { result, onChange } = render({
        value: [5, 5],
        commitOnRelease: true,
      })

      act(() => result.current.slide([7]))
      act(() => result.current.release([7]))

      expect(onChange).toHaveBeenCalledWith([7, 7])
    })

    it('reports nothing for a drag that ended where it began', () => {
      const { result, onChange } = render({ commitOnRelease: true })

      act(() => result.current.slide([10, 100]))
      act(() => result.current.release([0, 100]))

      expect(onChange).not.toHaveBeenCalled()
      expect(result.current.shown).toEqual([0, 100])
    })
  })
})
