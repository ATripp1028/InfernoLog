import { describe, expect, it } from 'vitest'
import { LEVEL_RANGE_BOUNDS } from '@infernolog/core'
import { LEVEL_RANGE_FIELDS } from '@/lib/levelSearchParams'
import {
  LATEST_GAME_VERSION,
  RANGE_FILTERS,
  parseRounded,
  parseWholeNumber,
  rangePatch,
  rangeValue,
  type RangeFilterConfig,
} from '../rangeFilters'

const cfg = (field: string): RangeFilterConfig =>
  RANGE_FILTERS.find((c) => c.field === field)!

describe('the range filter table', () => {
  // Every field the API can bound gets exactly one control, and nothing else.
  it('covers each range field exactly once', () => {
    expect(RANGE_FILTERS.map((c) => c.field).sort()).toEqual(
      [...LEVEL_RANGE_FIELDS].sort()
    )
  })

  // Anything strictly inside a control's domain is a bound the control can
  // write, so it has to be one the API accepts — or dragging a thumb earns a
  // 400 that the grid reports as a failed search.
  it.each(RANGE_FILTERS.map((c) => [c.field, c] as const))(
    'keeps the %s domain inside what the API accepts',
    (field, c) => {
      const bounds = LEVEL_RANGE_BOUNDS[field]
      if (bounds.min !== null) expect(c.domain[0]).toBeGreaterThanOrEqual(bounds.min)
      if (bounds.max !== null) expect(c.domain[1]).toBeLessThanOrEqual(bounds.max)
    }
  )

  // A box-only control is only useful if its ends can be typed.
  it('gives every control without a slider a parser', () => {
    for (const c of RANGE_FILTERS.filter((r) => !r.slider)) {
      expect(c.parseInput).toBeDefined()
    }
  })
})

describe('rangeValue', () => {
  it('sits an absent bound at its domain edge', () => {
    expect(rangeValue({}, cfg('stars'))).toEqual([0, 10])
  })

  it('reads a bound that is set', () => {
    expect(rangeValue({ starsMin: 4, starsMax: 8 }, cfg('stars'))).toEqual([
      4, 8,
    ])
  })

  // The API accepts a GDDL tier past 35; the slider draws it at its end.
  it('draws a bound beyond the domain at the edge it passed', () => {
    expect(rangeValue({ gddlTierMax: 40 }, cfg('gddlTier'))).toEqual([1, 35])
  })

  it('leaves an unbounded field open on both ends', () => {
    expect(rangeValue({}, cfg('likes'))).toEqual([
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ])
  })
})

describe('rangePatch', () => {
  it('writes a bound inside the domain', () => {
    expect(rangePatch(cfg('stars'), [4, 8])).toEqual({
      starsMin: 4,
      starsMax: 8,
    })
  })

  // An end dragged back to the edge removes the bound rather than pinning it —
  // "at least 1" would otherwise quietly drop every level with no tier.
  it('clears an end at its domain edge', () => {
    const patch = rangePatch(cfg('gddlTier'), [1, 35])

    expect(patch).toHaveProperty('gddlTierMin', undefined)
    expect(patch).toHaveProperty('gddlTierMax', undefined)
  })

  // The top of the game-version slider is open, so a newer version than the
  // slider knows still matches.
  it('leaves the newest game version open-ended', () => {
    expect(
      rangePatch(cfg('gameVersion'), [2, LATEST_GAME_VERSION]).gameVersionMax
    ).toBeUndefined()
  })

  // Radix steps in floating point; the URL should read 1.3, not 1.3000000000000003.
  it('snaps a fractional step to its own precision', () => {
    expect(
      rangePatch(cfg('gameVersion'), [1 + 0.1 * 3, 2.1]).gameVersionMin
    ).toBe(1.3)
  })

  it('round-trips through rangeValue', () => {
    const c = cfg('enjoyment')

    expect(rangeValue(rangePatch(c, [25, 75]), c)).toEqual([25, 75])
  })
})

describe('formatting the ends', () => {
  // The box-only fields have no slider to show that an end is open.
  it.each(['downloads', 'likes', 'objectCount', 'aredlRank', 'duration'])(
    'reads an open %s end as "Any"',
    (field) => {
      const c = cfg(field)

      expect(c.format(c.domain[0], 'min')).toBe('Any')
      expect(c.format(c.domain[1], 'max')).toBe('Any')
    }
  )

  it.each([
    ['downloads', 12345, '12,345'],
    ['aredlRank', 12, '#12'],
    ['duration', 125, '2:05'],
    ['gameVersion', 2, '2.0'],
  ])('renders a %s of %s as %p', (field, value, expected) => {
    expect(cfg(field).format(value, 'min')).toBe(expected)
  })

  // Tier 0 is a real tier, so it gets its name like any other.
  it('names the sheet tiers, tier 0 included', () => {
    expect(cfg('sheetTier').format(0, 'min')).toBe('Fuck (0)')
    expect(cfg('sheetTier').format(14, 'min')).toBe('Merciless (14)')
  })
})

describe('parsing the ends', () => {
  it.each([
    ['min', 0],
    ['max', Number.POSITIVE_INFINITY],
  ] as const)('opens the %s end for a blank box', (end, expected) => {
    expect(cfg('downloads').parseInput!('', end)).toBe(expected)
  })

  it('opens an end for a typed "Any"', () => {
    expect(cfg('downloads').parseInput!('any', 'max')).toBe(
      Number.POSITIVE_INFINITY
    )
  })

  it.each([
    ['downloads', '12,345', 12345],
    ['aredlRank', '#5', 5],
    ['likes', '-50', -50],
    ['duration', '1:30', 90],
    ['gddlTier', '35+', 35],
  ])('reads %s typed as %p', (field, text, expected) => {
    expect(cfg(field).parseInput!(text, 'min')).toBe(expected)
  })

  it('rejects an unparseable duration', () => {
    expect(cfg('duration').parseInput!('1:75', 'min')).toBeNull()
  })
})

describe('parseWholeNumber', () => {
  it.each([
    ['1,000', 1000],
    ['#12', 12],
    ['35+', 35],
    ['-4', -4],
  ])('reads %p as %s', (text, expected) => {
    expect(parseWholeNumber(text)).toBe(expected)
  })

  it.each(['1.5', 'abc', '', '1e3'])('rejects %p', (text) => {
    expect(parseWholeNumber(text)).toBeNull()
  })
})

describe('parseRounded', () => {
  it('rounds to a whole number', () => {
    expect(parseRounded('49.6')).toBe(50)
  })

  it.each(['', 'abc'])('rejects %p', (text) => {
    expect(parseRounded(text)).toBeNull()
  })
})
