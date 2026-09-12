import { describe, expect, it } from 'vitest'
import { LEVEL_RANGE_BOUNDS } from '@infernolog/core'
import { LEVEL_RANGE_FIELDS } from '@/lib/levelSearchParams'
import {
  GDDL_TIER_MAX,
  LATEST_GAME_VERSION,
  RANGE_FILTERS,
  boundsPatch,
  boundsValue,
  describeAredlRange,
  exactModePatch,
  exactValuePatch,
  parseWholeNumber,
  rangeModePatch,
  rangePatch,
  rangeValue,
  type BoundFilterConfig,
  type SliderFilterConfig,
} from '../rangeFilters'

const find = (field: string) => RANGE_FILTERS.find((c) => c.field === field)!
const slider = (field: string) => find(field) as SliderFilterConfig
const boxes = (field: string) => find(field) as BoundFilterConfig

describe('the range filter table', () => {
  // Every field the API can bound gets exactly one control, and nothing else.
  it('covers each range field exactly once', () => {
    expect(RANGE_FILTERS.map((c) => c.field).sort()).toEqual(
      [...LEVEL_RANGE_FIELDS].sort()
    )
  })

  it.each(['stars', 'sheetTier'])('has no %s range', (field) => {
    expect(RANGE_FILTERS.some((c) => (c.field as string) === field)).toBe(false)
  })

  it('takes the GDDL slider to tier 40', () => {
    expect(slider('gddlTier').domain[1]).toBe(40)
    expect(GDDL_TIER_MAX).toBe(40)
  })

  // Anything a slider can write has to be a bound the API accepts, or dragging
  // a thumb earns a 400 that the grid reports as a failed search.
  it.each(
    RANGE_FILTERS.filter((c) => c.kind === 'slider').map(
      (c) => [c.field, c] as const
    )
  )('keeps the %s slider inside what the API accepts', (field, c) => {
    const bounds = LEVEL_RANGE_BOUNDS[field]
    const cfg = c as SliderFilterConfig
    if (bounds.min !== null) {
      expect(cfg.domain[0]).toBeGreaterThanOrEqual(bounds.min)
    }
    if (bounds.max !== null) {
      expect(cfg.domain[1]).toBeLessThanOrEqual(bounds.max)
    }
  })

  // No slider domain can span these usefully, so they are typed instead.
  it.each(['downloads', 'likes', 'objectCount', 'aredlRank', 'duration'])(
    'types %s into boxes',
    (field) => {
      expect(find(field).kind).toBe('bounds')
    }
  )

  // The boxes explain themselves: a hint while empty, a message when wrong.
  it.each(
    RANGE_FILTERS.filter((c) => c.kind === 'bounds').map((c) => [c.field, c])
  )('gives the %s boxes labels, a hint and an error message', (_f, c) => {
    const cfg = c as BoundFilterConfig
    for (const text of [
      cfg.minLabel,
      cfg.maxLabel,
      cfg.minPlaceholder,
      cfg.maxPlaceholder,
      cfg.hint,
      cfg.invalidMessage,
    ]) {
      expect(text.length).toBeGreaterThan(0)
    }
  })
})

describe('rangeValue', () => {
  it('sits an absent bound at its domain edge', () => {
    expect(rangeValue({}, slider('gddlTier'))).toEqual([1, 40])
  })

  it('reads a bound that is set', () => {
    expect(
      rangeValue({ gddlTierMin: 4, gddlTierMax: 8 }, slider('gddlTier'))
    ).toEqual([4, 8])
  })

  it('draws a bound beyond the domain at the edge it passed', () => {
    expect(rangeValue({ gddlTierMax: 50 }, slider('gddlTier'))).toEqual([1, 40])
  })
})

describe('rangePatch', () => {
  it('writes a bound inside the domain', () => {
    expect(rangePatch(slider('enjoyment'), [25, 75])).toEqual({
      enjoymentMin: 25,
      enjoymentMax: 75,
    })
  })

  // An end dragged back to the edge removes the bound rather than pinning it —
  // "at least tier 1" would otherwise quietly drop every level with no tier.
  it('clears an end at its domain edge', () => {
    const patch = rangePatch(slider('gddlTier'), [1, 40])

    expect(patch).toHaveProperty('gddlTierMin', undefined)
    expect(patch).toHaveProperty('gddlTierMax', undefined)
  })

  it('leaves the newest game version open-ended', () => {
    expect(
      rangePatch(slider('gameVersion'), [2, LATEST_GAME_VERSION]).gameVersionMax
    ).toBeUndefined()
  })

  // Radix steps in floating point; the URL should read 1.3, not 1.3000000000000003.
  it('snaps a fractional step to its own precision', () => {
    expect(
      rangePatch(slider('gameVersion'), [1 + 0.1 * 3, 2.1]).gameVersionMin
    ).toBe(1.3)
  })

  it('round-trips through rangeValue', () => {
    const c = slider('enjoyment')

    expect(rangeValue(rangePatch(c, [25, 75]), c)).toEqual([25, 75])
  })
})

describe('boundsValue and boundsPatch', () => {
  it('reads both ends straight from the state', () => {
    expect(boundsValue({ aredlRankMax: 100 }, 'aredlRank')).toEqual({
      min: undefined,
      max: 100,
    })
  })

  it('writes both ends, clearing an absent one', () => {
    const patch = boundsPatch('downloads', { min: 1000, max: undefined })

    expect(patch.downloadsMin).toBe(1000)
    expect(patch).toHaveProperty('downloadsMax', undefined)
  })

  it('round-trips', () => {
    const b = { min: 5, max: 50 }

    expect(boundsValue(boundsPatch('likes', b), 'likes')).toEqual(b)
  })
})

describe('reading the boxes', () => {
  it.each([
    ['downloads', '12,345', 12345],
    ['aredlRank', '#5', 5],
    ['likes', '-50', -50],
    ['duration', '1:30', 90],
    ['duration', '90', 90],
  ])('reads %s typed as %p', (field, text, expected) => {
    expect(boxes(field).parse(text)).toBe(expected)
  })

  // Refused here so the box can say why, rather than the search 400ing.
  it.each([
    ['aredlRank', '0', 'ranks start at 1'],
    ['downloads', '-1', 'downloads cannot be negative'],
    ['objectCount', '1.5', 'a fraction'],
    ['duration', '1:75', 'an overflowing clock field'],
  ])('refuses a %s of %p (%s)', (field, text) => {
    expect(boxes(field).parse(text)).toBeNull()
  })

  it.each([
    ['downloads', 12345, '12,345'],
    ['aredlRank', 1234, '1,234'],
    ['duration', 125, '2:05'],
  ])('shows a %s of %s as %p', (field, value, expected) => {
    expect(boxes(field).format(value)).toBe(expected)
  })
})

describe('describing a set filter', () => {
  // Rank 1 is the hardest, so an upper bound alone is a top N.
  it.each([
    [undefined, 100, 'The top 100'],
    [1, 100, 'The top 100'],
    [50, undefined, 'Rank #50 and easier'],
    [1, undefined, 'Every ranked level'],
    [50, 100, 'Ranks #50 to #100'],
    [7, 7, 'Rank #7 only'],
  ])('reads AREDL %p to %p as %p', (min, max, expected) => {
    expect(describeAredlRange(min, max)).toBe(expected)
  })

  it.each([
    [10000, undefined, 'At least 10,000 downloads'],
    [undefined, 500, 'At most 500 downloads'],
    [100, 500, 'Between 100 and 500 downloads'],
    [500, 500, 'Exactly 500 downloads'],
  ])('reads downloads %p to %p as %p', (min, max, expected) => {
    expect(boxes('downloads').describe(min, max)).toBe(expected)
  })

  it('describes a duration as clock readings', () => {
    expect(boxes('duration').describe(60, 150)).toBe('Between 1:00 and 2:30')
  })
})

describe('the Exact mode', () => {
  it('is offered by every range filter but enjoyment', () => {
    expect(RANGE_FILTERS.filter((c) => !c.exact).map((c) => c.field)).toEqual([
      'enjoyment',
    ])
  })

  describe('switching to it', () => {
    it.each([
      ['the lower bound', { min: 10, max: 30 }, 10],
      [
        'the upper bound when that is all there is',
        { min: undefined, max: 30 },
        30,
      ],
      [
        'the bottom of the domain when nothing is set',
        { min: undefined, max: undefined },
        1,
      ],
      ['the domain edge for a bound past it', { min: undefined, max: 50 }, 40],
    ])('puts a slider on %s', (_label, bounds, expected) => {
      expect(exactModePatch(slider('gddlTier'), bounds)).toEqual({
        gddlTierMin: expected,
        gddlTierMax: expected,
      })
    })

    it('collapses boxes to their lower end', () => {
      expect(exactModePatch(boxes('aredlRank'), { min: 5, max: 50 })).toEqual({
        aredlRankMin: 5,
        aredlRankMax: 5,
      })
    })

    // An empty Exact box means no filter, so there is nothing to pick.
    it('leaves empty boxes empty', () => {
      const patch = exactModePatch(boxes('downloads'), {
        min: undefined,
        max: undefined,
      })

      expect(patch.downloadsMin).toBeUndefined()
      expect(patch.downloadsMax).toBeUndefined()
    })
  })

  describe('an exact slider value', () => {
    it('stays a real bound at the domain edge', () => {
      expect(exactValuePatch(slider('gddlTier'), 1)).toEqual({
        gddlTierMin: 1,
        gddlTierMax: 1,
      })
    })

    it('snaps to the step', () => {
      expect(
        exactValuePatch(slider('gameVersion'), 2.1000000000000001)
          .gameVersionMin
      ).toBe(2.1)
    })
  })

  describe('switching back to Range', () => {
    it('widens a slider value into "that and up"', () => {
      const patch = rangeModePatch(slider('gddlTier'), { min: 22, max: 22 })

      expect(patch.gddlTierMin).toBe(22)
      expect(patch.gddlTierMax).toBeUndefined()
    })

    // Tier 1 and up is every tier: the full, open range.
    it('opens a slider value at the bottom edge completely', () => {
      const patch = rangeModePatch(slider('gddlTier'), { min: 1, max: 1 })

      expect(patch.gddlTierMin).toBeUndefined()
      expect(patch.gddlTierMax).toBeUndefined()
    })

    it('reopens a box value as "at least"', () => {
      const patch = rangeModePatch(boxes('downloads'), { min: 500, max: 500 })

      expect(patch.downloadsMin).toBe(500)
      expect(patch.downloadsMax).toBeUndefined()
    })

    it('keeps a filter that is already a range', () => {
      expect(
        rangeModePatch(boxes('downloads'), { min: 100, max: 500 })
      ).toEqual({ downloadsMin: 100, downloadsMax: 500 })
    })
  })

  it('gives every box pair an Exact label and hint', () => {
    for (const c of RANGE_FILTERS.filter((r) => r.kind === 'bounds')) {
      const cfg = c as BoundFilterConfig
      expect(cfg.exactLabel.length).toBeGreaterThan(0)
      expect(cfg.exactHint.length).toBeGreaterThan(0)
    }
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
