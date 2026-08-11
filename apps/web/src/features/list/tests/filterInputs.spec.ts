import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  parseFilterDate,
  toIso,
  useDateField,
  useRangeDrafts,
} from '../useFilterInputs'
import { FLAGS, LEVEL_FLAGS, toggle, useFilterPanel } from '../useFilterPanel'
import { RATING_DOMAIN, TIER_DOMAIN, type Range } from '../types'
import { filters } from './fixtures'

describe('toggle', () => {
  it('adds a value that is not selected', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('removes a value that is', () => {
    expect(toggle(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('leaves the input untouched', () => {
    const original = ['a']

    toggle(original, 'b')

    expect(original).toEqual(['a'])
  })

  it('round-trips back to the original selection', () => {
    expect(toggle(toggle(['a'], 'b'), 'b')).toEqual(['a'])
  })
})

describe('the filter chip tables', () => {
  // The two flag groups are rendered as separate sections, so a flag in both
  // would appear twice and toggle itself.
  it('never lists the same flag in both groups', () => {
    const runFlags = FLAGS.map((f) => f.value)
    const levelFlags = LEVEL_FLAGS.map((f) => f.value)

    expect(runFlags.filter((f) => levelFlags.includes(f))).toEqual([])
  })

  it.each([
    ['run', FLAGS],
    ['level', LEVEL_FLAGS],
  ])('labels every %s flag exactly once', (_label, group) => {
    const values = group.map((f) => f.value)

    expect(new Set(values).size).toBe(values.length)
    expect(group.every((f) => f.label.length > 0)).toBe(true)
  })
})

describe('useFilterPanel', () => {
  const render = (
    opts: {
      state?: ReturnType<typeof filters>
      scale?: 'ZERO_TO_TEN' | 'ZERO_TO_HUNDRED'
      maxAttempts?: number
    } = {}
  ) => {
    const onChange = vi.fn()
    const view = renderHook(() =>
      useFilterPanel({
        filters: opts.state ?? filters(),
        onChange,
        scale: opts.scale ?? 'ZERO_TO_HUNDRED',
        maxAttempts: opts.maxAttempts ?? 25000,
      })
    )
    return { ...view, onChange }
  }

  it('patches one field, keeping the rest', () => {
    const { result, onChange } = render({
      state: filters({ statuses: ['COMPLETED'] }),
    })

    act(() => result.current.set({ flags: ['onStream'] }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ['COMPLETED'],
        flags: ['onStream'],
      })
    )
  })

  it('resets to a fresh filter state', () => {
    const { result, onChange } = render({
      state: filters({ statuses: ['COMPLETED'] }),
    })

    act(() => result.current.clearAll())

    expect(onChange.mock.calls[0]![0].statuses).toEqual([])
  })

  it('reports whether anything is filtered', () => {
    expect(render().result.current.hasActiveFilters).toBe(false)
    expect(
      render({ state: filters({ statuses: ['COMPLETED'] }) }).result.current
        .hasActiveFilters
    ).toBe(true)
  })

  it('merges a category range alongside the others', () => {
    const { result, onChange } = render({
      state: filters({ categoryRatings: { design: [10, 100] } }),
    })

    act(() => result.current.setCategoryRating('gameplay', [50, 100]))

    expect(onChange.mock.calls[0]![0].categoryRatings).toEqual({
      design: [10, 100],
      gameplay: [50, 100],
    })
  })

  describe('parsing typed values', () => {
    // Ratings are typed on the user's display scale but stored 0–100.
    it('converts a typed rating from the display scale', () => {
      const { result } = render({ scale: 'ZERO_TO_TEN' })

      expect(result.current.parseRating('8.5')).toBe(85)
    })

    it('leaves a rating alone on the 0-100 scale', () => {
      expect(render().result.current.parseRating('85')).toBe(85)
    })

    it.each([
      ['above the domain', '999', RATING_DOMAIN[1]],
      ['below it', '-50', RATING_DOMAIN[0]],
    ])('clamps a rating %s', (_label, text, expected) => {
      expect(render().result.current.parseRating(text)).toBe(expected)
    })

    // The tier box shows "35+" for the top bucket, so the suffix has to be
    // accepted back.
    it('accepts the top tier’s + suffix', () => {
      expect(render().result.current.parseTier('35+')).toBe(35)
    })

    it.each([
      ['above the domain', '99', TIER_DOMAIN[1]],
      ['below it', '0', TIER_DOMAIN[0]],
    ])('clamps a tier %s', (_label, text, expected) => {
      expect(render().result.current.parseTier(text)).toBe(expected)
    })

    // Attempts are rendered with thousands separators, so a pasted value
    // carries them back in.
    it('accepts thousands separators in an attempts value', () => {
      expect(render().result.current.parseAttempts('12,345')).toBe(12345)
    })

    it('clamps attempts to the caller’s own maximum', () => {
      const { result } = render({ maxAttempts: 500 })

      expect(result.current.parseAttempts('9999')).toBe(500)
      expect(result.current.parseAttempts('-5')).toBe(0)
    })

    it.each([
      ['parseRating', 'abc'],
      ['parseTier', 'abc'],
      ['parseAttempts', 'abc'],
    ] as const)('reports %s of unparseable text as nothing', (fn, text) => {
      expect(render().result.current[fn](text)).toBeNull()
    })
  })
})

describe('parseFilterDate', () => {
  const march14 = new Date(2026, 2, 14).getTime()

  it.each([
    ['MDY', '03/14/2026'],
    ['DMY', '14/03/2026'],
    ['YMD', '2026/03/14'],
    ['ISO', '2026-03-14'],
  ] as const)('reads %s order', (pref, text) => {
    expect(parseFilterDate(text, pref)).toBe(march14)
  })

  it('ignores surrounding whitespace', () => {
    expect(parseFilterDate('  03/14/2026  ', 'MDY')).toBe(march14)
  })

  // The same digits mean different days depending on the preference.
  it('reads an ambiguous date by the stated preference', () => {
    expect(parseFilterDate('01/02/2026', 'MDY')).toBe(
      new Date(2026, 0, 2).getTime()
    )
    expect(parseFilterDate('01/02/2026', 'DMY')).toBe(
      new Date(2026, 1, 1).getTime()
    )
  })

  // JS Date silently rolls Feb 30 into Mar 2; the round-trip check catches it
  // so a typo reads as invalid rather than as some other day.
  it.each([
    ['a day that does not exist', '02/30/2026'],
    ['a month that does not exist', '13/01/2026'],
  ])('rejects %s rather than rolling it over', (_label, text) => {
    expect(parseFilterDate(text, 'MDY')).toBeNull()
  })

  it.each([
    ['too few parts', '03/2026'],
    ['too many parts', '03/14/2026/01'],
    ['non-numeric text', 'March 14th'],
    ['nothing at all', ''],
    ['the wrong separator for the preference', '2026/03/14'],
  ])('rejects %s', (_label, text) => {
    expect(parseFilterDate(text, 'ISO')).toBeNull()
  })
})

describe('toIso', () => {
  it('renders epoch ms as a native date-input value', () => {
    expect(toIso(new Date(2026, 2, 14).getTime())).toBe('2026-03-14')
  })

  it('zero-pads the month and day', () => {
    expect(toIso(new Date(2026, 0, 5).getTime())).toBe('2026-01-05')
  })

  it('round-trips through parseFilterDate', () => {
    const ms = new Date(2026, 2, 14).getTime()

    expect(parseFilterDate(toIso(ms), 'ISO')).toBe(ms)
  })
})

describe('useRangeDrafts', () => {
  const render = (opts: { value?: Range; parseInput?: null } = {}) => {
    const onChange = vi.fn()
    const view = renderHook(() =>
      useRangeDrafts({
        min: 0,
        max: 100,
        value: opts.value ?? [0, 100],
        onChange,
        parseInput:
          opts.parseInput === null
            ? undefined
            : (text) => {
                const n = Number(text)
                return Number.isNaN(n) ? null : n
              },
      })
    )
    return { ...view, onChange }
  }

  it('starts with no draft, showing the committed value', () => {
    const { result } = render()

    expect(result.current.minDraft).toBeNull()
    expect(result.current.maxDraft).toBeNull()
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
})

describe('useDateField', () => {
  const render = (opts: { min?: number; max?: number } = {}) => {
    const onChange = vi.fn()
    const view = renderHook(() =>
      useDateField({
        onChange,
        datePref: 'ISO',
        min: opts.min,
        max: opts.max,
      })
    )
    return { ...view, onChange }
  }

  it('commits a typed date', () => {
    const { result, onChange } = render()

    act(() => result.current.commit('2026-03-14'))

    expect(onChange).toHaveBeenCalledWith(new Date(2026, 2, 14).getTime())
  })

  // An empty box means "no bound", which is different from an unparseable one.
  it('clears the bound for an empty box', () => {
    const { result, onChange } = render()

    act(() => result.current.commit('   '))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('discards an unparseable commit without clearing the bound', () => {
    const { result, onChange } = render()

    act(() => result.current.commit('not a date'))

    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    [
      'below the minimum',
      { min: new Date(2026, 0, 1).getTime() },
      '2020-01-01',
      new Date(2026, 0, 1).getTime(),
    ],
    [
      'above the maximum',
      { max: new Date(2026, 0, 1).getTime() },
      '2030-01-01',
      new Date(2026, 0, 1).getTime(),
    ],
  ])('clamps a date %s', (_label, bounds, text, expected) => {
    const { result, onChange } = render(bounds)

    act(() => result.current.commit(text))

    expect(onChange).toHaveBeenCalledWith(expected)
  })

  it('clears on demand', () => {
    const { result, onChange } = render()
    act(() => result.current.setDraft('half typed'))

    act(() => result.current.clear())

    expect(onChange).toHaveBeenCalledWith(null)
    expect(result.current.draft).toBeNull()
  })

  // The native calendar always hands back YYYY-MM-DD, whatever the user's
  // display preference is.
  it('commits an ISO value from the native calendar', () => {
    const { result, onChange } = render()

    act(() => result.current.commitIso('2026-03-14'))

    expect(onChange).toHaveBeenCalledWith(new Date(2026, 2, 14).getTime())
  })

  it('ignores an empty calendar value', () => {
    const { result, onChange } = render()

    act(() => result.current.commitIso(''))

    expect(onChange).not.toHaveBeenCalled()
  })

  // showPicker() throws without a user gesture, which must not take the page
  // down with it.
  it('swallows a rejected showPicker call', () => {
    const { result } = render()
    Object.defineProperty(result.current.calRef, 'current', {
      value: {
        showPicker: () => {
          throw new Error('not allowed')
        },
      },
      writable: true,
    })

    expect(() => result.current.openCalendar()).not.toThrow()
  })

  it('does nothing when there is no calendar to open', () => {
    const { result } = render()

    expect(() => result.current.openCalendar()).not.toThrow()
  })
})
