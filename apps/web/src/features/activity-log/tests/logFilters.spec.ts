/**
 * The Log page's filter vocabulary and range arithmetic.
 *
 * The chip list is asserted rather than derived because the hidden event type
 * must never acquire a chip — something that enumerated the event-type enum and
 * rendered what it found would grow one silently.
 *
 * The ranges bound RECORDED time and start at local midnight; an off-by-a-day
 * boundary is invisible in a rendered feed and obvious here.
 */

import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_RANGES,
  EMPTY_CUSTOM_RANGE,
  KIND_CHIPS,
  levelOptions,
  matchLevels,
  rangeBounds,
  rangeIsActive,
} from '../logFilters'
import { makeLevel, makeListItem } from '@/utils/testUtils'

describe('KIND_CHIPS', () => {
  it('offers exactly the four things a user recognises doing', () => {
    expect(KIND_CHIPS.map((c) => c.kind)).toEqual([
      'PROGRESS',
      'RANKING',
      'EDITS',
      'SETTINGS',
    ])
    expect(KIND_CHIPS.map((c) => c.label)).toEqual([
      'Progress',
      'Ranking',
      'Edits',
      'Settings',
    ])
  })
})

describe('rangeBounds', () => {
  // Mid-afternoon, so "today" cannot accidentally pass by landing on midnight.
  const now = new Date(2026, 7, 25, 15, 30)
  const from = (range: Parameters<typeof rangeBounds>[0]) =>
    rangeBounds(range, EMPTY_CUSTOM_RANGE, now).from

  it('sends no bound for any time', () => {
    expect(rangeBounds('any', EMPTY_CUSTOM_RANGE, now)).toEqual({
      from: null,
      to: null,
    })
  })

  it('starts today at local midnight, not at the current moment', () => {
    const start = new Date(from('today')!)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7)
    expect(start.getDate()).toBe(25)
    expect(start.getHours()).toBe(0)
  })

  it('counts the last 7 days inclusive of today', () => {
    // 19th through 25th is seven days, so the bound is the 19th — not the 18th.
    expect(new Date(from('week')!).getDate()).toBe(19)
  })

  it('counts the last 30 days inclusive of today', () => {
    const start = new Date(from('month')!)
    expect(start.getMonth()).toBe(6)
    expect(start.getDate()).toBe(27)
  })

  it('leaves the relative ranges open at the top', () => {
    // They all run up to now, so an upper bound would only be able to go stale.
    expect(rangeBounds('week', EMPTY_CUSTOM_RANGE, now).to).toBeNull()
  })

  it('runs a custom upper bound to the END of the day chosen', () => {
    // Picking the 25th at both ends means that whole day. A `to` of midnight
    // would match the single instant, and so almost nothing.
    const day = new Date(2026, 7, 25).getTime()
    const bounds = rangeBounds('custom', { from: day, to: day }, now)
    const to = new Date(bounds.to!)
    expect(to.getDate()).toBe(25)
    expect(to.getHours()).toBe(23)
    expect(to.getMinutes()).toBe(59)
  })

  it('allows a custom range open at either end', () => {
    const day = new Date(2026, 7, 20).getTime()
    expect(rangeBounds('custom', { from: day, to: null }, now).to).toBeNull()
    expect(rangeBounds('custom', { from: null, to: day }, now).from).toBeNull()
  })

  it('offers every range the picker lists', () => {
    for (const option of ACTIVITY_RANGES) {
      expect(() =>
        rangeBounds(option.key, EMPTY_CUSTOM_RANGE, now)
      ).not.toThrow()
    }
  })
})

describe('rangeIsActive', () => {
  it('does not count an empty custom range as a filter', () => {
    // Choosing "Custom range…" and filling in neither box narrows nothing, so
    // it must not light up Clear.
    expect(rangeIsActive('custom', EMPTY_CUSTOM_RANGE)).toBe(false)
  })

  it('counts a custom range with either end set', () => {
    expect(rangeIsActive('custom', { from: 1, to: null })).toBe(true)
    expect(rangeIsActive('custom', { from: null, to: 1 })).toBe(true)
  })

  it('counts every relative range, and never "any time"', () => {
    expect(rangeIsActive('week', EMPTY_CUSTOM_RANGE)).toBe(true)
    expect(rangeIsActive('any', EMPTY_CUSTOM_RANGE)).toBe(false)
  })
})

describe('levelOptions', () => {
  it('sorts by name so the dropdown is scannable', () => {
    const options = levelOptions([
      makeListItem({ level: makeLevel({ inGameId: '1', name: 'Tartarus' }) }),
      makeListItem({ level: makeLevel({ inGameId: '2', name: 'Bloodbath' }) }),
    ])
    expect(options.map((o) => o.name)).toEqual(['Bloodbath', 'Tartarus'])
  })

  it('sorts an unnamed level by its id, which is what will be shown for it', () => {
    // The name stays null — LevelResultRow renders "Level #id" for it — but the
    // sort has to fall back to something, or every unnamed level clusters.
    const options = levelOptions([
      makeListItem({ level: makeLevel({ inGameId: '9999', name: 'Zodiac' }) }),
      makeListItem({ level: makeLevel({ inGameId: '4284013', name: null }) }),
    ])
    expect(options.map((o) => o.levelId)).toEqual(['4284013', '9999'])
    expect(options[0]!.name).toBeNull()
  })

  it('matches an unnamed level on its id', () => {
    const options = levelOptions([
      makeListItem({ level: makeLevel({ inGameId: '4284013', name: null }) }),
    ])
    expect(matchLevels(options, '4284')).toHaveLength(1)
  })

  it('is empty while the list is still loading', () => {
    expect(levelOptions(undefined)).toEqual([])
  })
})

describe('matchLevels', () => {
  const options = levelOptions([
    makeListItem({
      level: makeLevel({
        inGameId: '4284013',
        name: 'Bloodbath',
        creator: 'Riot',
      }),
    }),
    makeListItem({
      level: makeLevel({
        inGameId: '9999',
        name: 'Cataclysm',
        creator: 'Ggb0y',
      }),
    }),
  ])

  it('matches on the level name', () => {
    expect(matchLevels(options, 'blood').map((o) => o.levelId)).toEqual([
      '4284013',
    ])
  })

  it('matches on the creator', () => {
    expect(matchLevels(options, 'ggb').map((o) => o.levelId)).toEqual(['9999'])
  })

  it('matches on the level id, which is what a user often has to hand', () => {
    expect(matchLevels(options, '4284').map((o) => o.levelId)).toEqual([
      '4284013',
    ])
  })

  it('ignores case', () => {
    expect(matchLevels(options, 'BLOODBATH')).toHaveLength(1)
  })

  it('shows the first levels before anything is typed', () => {
    expect(matchLevels(options, '')).toHaveLength(2)
  })

  it('carries what the suggestion row renders', () => {
    const [first] = matchLevels(options, 'blood')
    expect(first).toMatchObject({ name: 'Bloodbath', creator: 'Riot' })
  })
})
