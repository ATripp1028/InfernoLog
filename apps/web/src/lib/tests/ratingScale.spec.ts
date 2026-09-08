import { describe, expect, it } from 'vitest'
import {
  ENJOYMENT_MAX,
  SCORE_MAX,
  formatEnjoyment,
  formatScore,
  formatScoreDisplay,
  toScoreDisplay,
  toScoreInternal,
} from '../ratingScale'
import {
  LEVEL_SEARCH_RESULTS_CAP,
  sortAndCapSearchResults,
} from '../levelSearchResults'
import { backOriginState, readBackOrigin } from '../backOrigin'
import { cn } from '../utils'

// The scale is fixed per field: scores read 0-10 with decimals, enjoyment
// reads 0-100 whole. Both are stored as an integer 0-100, so only scores
// cross a conversion boundary.
describe('scale maximums', () => {
  it('tops scores at 10 and enjoyment at 100', () => {
    expect(SCORE_MAX).toBe(10)
    expect(ENJOYMENT_MAX).toBe(100)
  })
})

describe('toScoreDisplay', () => {
  it('divides the internal value down to the 0-10 scale', () => {
    expect(toScoreDisplay(85)).toBe(8.5)
  })

  it.each([
    [0, 0],
    [100, 10],
  ])('maps the endpoint %s to %s', (internal, expected) => {
    expect(toScoreDisplay(internal)).toBe(expected)
  })
})

describe('toScoreInternal', () => {
  it('multiplies back up from the 0-10 scale', () => {
    expect(toScoreInternal(8.5)).toBe(85)
  })

  // Rounding is what keeps the internal value an integer — a score gets one
  // decimal place and no more.
  it('rounds a value finer than the internal scale can hold', () => {
    expect(toScoreInternal(6.85)).toBe(69)
    expect(toScoreInternal(6.84)).toBe(68)
  })

  it('always produces a whole number', () => {
    for (const v of [0.05, 1.234, 6.789, 9.999]) {
      expect(Number.isInteger(toScoreInternal(v))).toBe(true)
    }
  })

  // Round-tripping is the contract the edit modals rely on: reopening an
  // entry must show back what was saved.
  it.each([0, 1, 42, 85, 99, 100])(
    'round-trips the internal value %s',
    (internal) => {
      expect(toScoreInternal(toScoreDisplay(internal))).toBe(internal)
    }
  )
})

describe('formatScore', () => {
  // Trailing zeros are trimmed so a whole number reads as one.
  it.each([
    [80, '8'],
    [68, '6.8'],
    [100, '10'],
    [0, '0'],
  ])('renders the internal %s as %s', (internal, expected) => {
    expect(formatScore(internal)).toBe(expected)
  })

  // Weighted averages carry more precision than a stored rating does.
  it('keeps up to three decimals from a weighted average', () => {
    expect(formatScoreDisplay(6.345)).toBe('6.345')
  })

  it('trims a trailing zero without eating a significant one', () => {
    expect(formatScoreDisplay(6.8)).toBe('6.8')
    expect(formatScoreDisplay(6.804)).toBe('6.804')
  })

  it('renders a whole number with no decimal point', () => {
    expect(formatScoreDisplay(7)).toBe('7')
  })

  it('rounds beyond three decimals', () => {
    expect(formatScoreDisplay(6.3456)).toBe('6.346')
  })
})

// Enjoyment's display units are its stored units, so this prints the number
// it was given and never grows a decimal point.
describe('formatEnjoyment', () => {
  it.each([
    [85, '85'],
    [100, '100'],
    [0, '0'],
    [7, '7'],
  ])('renders the internal %s as %s', (internal, expected) => {
    expect(formatEnjoyment(internal)).toBe(expected)
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

    expect(sortAndCapSearchResults(rows, (r) => r.startsWith('g'), 2)).toEqual([
      'ok',
      'g1',
    ])
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
    expect(readBackOrigin(backOriginState('/log?sort=likes'))).toEqual({
      href: '/log?sort=likes',
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
