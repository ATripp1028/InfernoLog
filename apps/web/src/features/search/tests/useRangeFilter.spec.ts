import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SEARCH_STATE,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import { RANGE_FILTERS } from '../rangeFilters'
import { useRangeFilter } from '../useRangeFilter'

const state = (overrides: Partial<SearchPageState> = {}): SearchPageState => ({
  ...DEFAULT_SEARCH_STATE,
  ...overrides,
})

function render(field: string, initial: SearchPageState = state()) {
  const onChange = vi.fn()
  const cfg = RANGE_FILTERS.find((c) => c.field === field)!
  const view = renderHook(
    ({ s }: { s: SearchPageState }) =>
      useRangeFilter({ cfg, state: s, onChange }),
    { initialProps: { s: initial } }
  )
  return { ...view, onChange }
}

describe('useRangeFilter', () => {
  describe('a slider', () => {
    it('starts as a range', () => {
      expect(render('gddlTier').result.current.mode).toBe('range')
    })

    it('reads equal bounds in the URL as exact', () => {
      expect(
        render('gddlTier', state({ gddlTierMin: 22, gddlTierMax: 22 })).result
          .current.mode
      ).toBe('exact')
    })

    // A thumb always sits on a value, so Exact picks one at once.
    it('collapses to one value when switched to Exact', () => {
      const { result, onChange } = render(
        'gddlTier',
        state({ gddlTierMin: 10, gddlTierMax: 30 })
      )

      act(() => result.current.setMode('exact'))

      expect(onChange).toHaveBeenCalledWith({
        gddlTierMin: 10,
        gddlTierMax: 10,
      })
    })

    it('writes a one-thumb drag as both bounds', () => {
      const { result, onChange } = render(
        'gddlTier',
        state({ gddlTierMin: 10, gddlTierMax: 10 })
      )
      const view = result.current.view

      act(() => view.kind === 'slider' && view.onChange([22, 22]))

      expect(onChange).toHaveBeenCalledWith({
        gddlTierMin: 22,
        gddlTierMax: 22,
      })
    })

    // "Exactly tier 1" is a real filter, not the open edge of a range.
    it('keeps an exact value at the domain edge as a real bound', () => {
      const { result, onChange } = render(
        'gddlTier',
        state({ gddlTierMin: 5, gddlTierMax: 5 })
      )
      const view = result.current.view

      act(() => view.kind === 'slider' && view.onChange([1, 1]))

      expect(onChange).toHaveBeenCalledWith({ gddlTierMin: 1, gddlTierMax: 1 })
    })

    it('widens an exact value into "that and up" when switched back', () => {
      const { result, onChange } = render(
        'gddlTier',
        state({ gddlTierMin: 22, gddlTierMax: 22 })
      )

      act(() => result.current.setMode('range'))

      expect(onChange).toHaveBeenCalledWith({
        gddlTierMin: 22,
        gddlTierMax: undefined,
      })
    })

    it('returns to Range when the bounds are cleared', () => {
      const { result, rerender } = render(
        'gddlTier',
        state({ gddlTierMin: 22, gddlTierMax: 22 })
      )

      rerender({ s: state() })

      expect(result.current.mode).toBe('range')
    })
  })

  describe('a pair of boxes', () => {
    // An empty Exact box is a real state for boxes, so the switch takes effect
    // before anything is typed.
    it('switches to Exact with nothing typed', () => {
      const { result } = render('aredlRank')

      act(() => result.current.setMode('exact'))

      expect(result.current.mode).toBe('exact')
    })

    it('collapses a range to its lower end when switched to Exact', () => {
      const { result, onChange } = render(
        'aredlRank',
        state({ aredlRankMin: 5, aredlRankMax: 50 })
      )

      act(() => result.current.setMode('exact'))

      expect(onChange).toHaveBeenCalledWith({ aredlRankMin: 5, aredlRankMax: 5 })
    })

    it('stays Exact, and empty, through Clear all', () => {
      const { result, rerender } = render(
        'downloads',
        state({ downloadsMin: 500, downloadsMax: 500 })
      )
      expect(result.current.mode).toBe('exact')

      rerender({ s: state() })

      expect(result.current.mode).toBe('exact')
    })

    it('reopens an exact value as "at least" when switched back', () => {
      const { result, onChange } = render(
        'downloads',
        state({ downloadsMin: 500, downloadsMax: 500 })
      )

      act(() => result.current.setMode('range'))

      expect(result.current.mode).toBe('range')
      expect(onChange).toHaveBeenCalledWith({
        downloadsMin: 500,
        downloadsMax: undefined,
      })
    })
  })

  // Scores are stored to two decimals, so an exact whole number would match
  // almost nothing.
  it('offers no Exact mode for enjoyment', () => {
    const { result, onChange } = render('enjoyment')

    expect(result.current.canSwitch).toBe(false)
    act(() => result.current.setMode('exact'))

    expect(result.current.mode).toBe('range')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does nothing when switched to the mode it is already in', () => {
    const { result, onChange } = render('gddlTier')

    act(() => result.current.setMode('range'))

    expect(onChange).not.toHaveBeenCalled()
  })
})
