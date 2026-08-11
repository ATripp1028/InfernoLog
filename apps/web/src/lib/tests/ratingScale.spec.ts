import { describe, expect, it } from 'vitest'
import {
  displayMax,
  formatDisplayRating,
  formatRating,
  toDisplay,
  toInternal,
} from '../ratingScale'
import {
  LEVEL_SEARCH_RESULTS_CAP,
  sortAndCapSearchResults,
} from '../levelSearchResults'
import { backOriginState, readBackOrigin } from '../backOrigin'
import { cn } from '../utils'

describe('displayMax', () => {
  it.each([
    ['ZERO_TO_TEN', 10],
    ['ZERO_TO_HUNDRED', 100],
  ] as const)('tops the %s scale at %s', (scale, expected) => {
    expect(displayMax(scale)).toBe(expected)
  })
})

// Ratings are stored 0-100 internally whatever the user chose to see, so
// every conversion happens at the display layer alone.
describe('toDisplay', () => {
  it('leaves an internal value alone on the 0-100 scale', () => {
    expect(toDisplay(85, 'ZERO_TO_HUNDRED')).toBe(85)
  })

  it('divides for the 0-10 scale', () => {
    expect(toDisplay(85, 'ZERO_TO_TEN')).toBe(8.5)
  })

  it.each([
    [0, 0],
    [100, 10],
  ])('maps the endpoint %s to %s', (internal, expected) => {
    expect(toDisplay(internal, 'ZERO_TO_TEN')).toBe(expected)
  })
})

describe('toInternal', () => {
  it('multiplies back up from the 0-10 scale', () => {
    expect(toInternal(8.5, 'ZERO_TO_TEN')).toBe(85)
  })

  // Rounding is what keeps the internal value an integer — a 0-10 display
  // value gets one decimal place and no more.
  it('rounds a value finer than the internal scale can hold', () => {
    expect(toInternal(6.85, 'ZERO_TO_TEN')).toBe(69)
    expect(toInternal(6.84, 'ZERO_TO_TEN')).toBe(68)
  })

  it('rounds a fractional 0-100 value too', () => {
    expect(toInternal(85.4, 'ZERO_TO_HUNDRED')).toBe(85)
    expect(toInternal(85.6, 'ZERO_TO_HUNDRED')).toBe(86)
  })

  it('always produces a whole number', () => {
    for (const v of [0.05, 1.234, 6.789, 9.999]) {
      expect(Number.isInteger(toInternal(v, 'ZERO_TO_TEN'))).toBe(true)
    }
  })

  // Round-tripping is the contract the edit modals rely on: reopening an
  // entry must show back what was saved.
  it.each([0, 1, 42, 85, 99, 100])(
    'round-trips the internal value %s on both scales',
    (internal) => {
      expect(toInternal(toDisplay(internal, 'ZERO_TO_TEN'), 'ZERO_TO_TEN')).toBe(
        internal
      )
      expect(
        toInternal(toDisplay(internal, 'ZERO_TO_HUNDRED'), 'ZERO_TO_HUNDRED')
      ).toBe(internal)
    }
  )
})

describe('formatRating', () => {
  // Trailing zeros are trimmed so a whole number reads as one.
  it.each([
    [80, 'ZERO_TO_TEN', '8'],
    [68, 'ZERO_TO_TEN', '6.8'],
    [100, 'ZERO_TO_TEN', '10'],
    [0, 'ZERO_TO_TEN', '0'],
  ] as const)('renders %s on the 0-10 scale as %s', (internal, scale, out) => {
    expect(formatRating(internal, scale)).toBe(out)
  })

  it.each([
    [85, '85'],
    [100, '100'],
    [0, '0'],
  ])('renders %s on the 0-100 scale as %s', (internal, expected) => {
    expect(formatRating(internal, 'ZERO_TO_HUNDRED')).toBe(expected)
  })

  // Weighted averages carry more precision than a stored rating does.
  it('keeps up to three decimals from a weighted average', () => {
    expect(formatDisplayRating(6.345)).toBe('6.345')
  })

  it('trims a trailing zero without eating a significant one', () => {
    expect(formatDisplayRating(6.8)).toBe('6.8')
    expect(formatDisplayRating(6.804)).toBe('6.804')
  })

  it('renders a whole number with no decimal point', () => {
    expect(formatDisplayRating(7)).toBe('7')
  })

  it('rounds beyond three decimals', () => {
    expect(formatDisplayRating(6.3456)).toBe('6.346')
  })
})

// Greyed-out rows can't be clicked, so letting them hold the top slots would
// waste a capped result list.
describe('sortAndCapSearchResults', () => {
  const none = () => false

  it('keeps the server’s order when nothing is greyed out', () => {
    expect(sortAndCapSearchResults(['a', 'b', 'c'], none)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('floats the actionable rows above the greyed-out ones', () => {
    expect(
      sortAndCapSearchResults(['grey', 'ok', 'grey2', 'ok2'], (r) =>
        r.startsWith('grey')
      )
    ).toEqual(['ok', 'ok2', 'grey', 'grey2'])
  })

  // Stable within each group, so relevance order survives among same-kind rows.
  it('keeps relevance order within each group', () => {
    const rows = ['a', 'g1', 'b', 'g2', 'c']

    expect(sortAndCapSearchResults(rows, (r) => r.startsWith('g'))).toEqual([
      'a',
      'b',
      'c',
      'g1',
      'g2',
    ])
  })

  it('trims to the default cap', () => {
    const rows = Array.from({ length: 20 }, (_, i) => `r${i}`)

    expect(sortAndCapSearchResults(rows, none)).toHaveLength(
      LEVEL_SEARCH_RESULTS_CAP
    )
  })

  it('honours a caller’s own cap', () => {
    expect(sortAndCapSearchResults(['a', 'b', 'c'], none, 2)).toEqual([
      'a',
      'b',
    ])
  })

  // The sort happens before the trim, so an actionable row past the cap in
  // the server's order still makes the cut.
  it('sorts before trimming', () => {
    const rows = ['g1', 'g2', 'g3', 'ok']

    expect(
      sortAndCapSearchResults(rows, (r) => r.startsWith('g'), 2)
    ).toEqual(['ok', 'g1'])
  })

  it('leaves the input untouched', () => {
    const rows = ['g', 'ok']

    sortAndCapSearchResults(rows, (r) => r === 'g')

    expect(rows).toEqual(['g', 'ok'])
  })

  it('handles an empty result set', () => {
    expect(sortAndCapSearchResults([], none)).toEqual([])
  })
})

// The back origin rides in router location state rather than the URL, so it
// disappears on a hard refresh or a shared link — where there is no sensible
// "back" anyway.
describe('backOrigin', () => {
  it('round-trips the href it recorded', () => {
    expect(readBackOrigin(backOriginState('/list?sort=likes'))).toEqual({
      href: '/list?sort=likes',
    })
  })

  it('reports nothing for a page reached without an in-app link', () => {
    expect(readBackOrigin({} as never)).toBeUndefined()
  })

  it('reports nothing for unrelated state', () => {
    expect(readBackOrigin({ somethingElse: 1 } as never)).toBeUndefined()
  })
})

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy entries', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b')
  })

  it('flattens the conditional forms', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c')
  })

  // This is what lets a className prop override a component's own defaults.
  it('lets a later Tailwind utility win over an earlier one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('leaves utilities from different groups alone', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4')
  })
})
