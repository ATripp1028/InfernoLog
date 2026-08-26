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
  KIND_CHIPS,
  levelOptions,
  rangeStart,
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

describe('rangeStart', () => {
  // Mid-afternoon, so "today" cannot accidentally pass by landing on midnight.
  const now = new Date(2026, 7, 25, 15, 30)

  it('sends no bound for any time', () => {
    expect(rangeStart('any', now)).toBeNull()
  })

  it('starts today at local midnight, not at the current moment', () => {
    const start = new Date(rangeStart('today', now)!)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7)
    expect(start.getDate()).toBe(25)
    expect(start.getHours()).toBe(0)
  })

  it('counts the last 7 days inclusive of today', () => {
    // 19th through 25th is seven days, so the bound is the 19th — not the 18th.
    const start = new Date(rangeStart('week', now)!)
    expect(start.getDate()).toBe(19)
  })

  it('counts the last 30 days inclusive of today', () => {
    const start = new Date(rangeStart('month', now)!)
    expect(start.getMonth()).toBe(6)
    expect(start.getDate()).toBe(27)
  })

  it('offers every range the picker lists', () => {
    for (const option of ACTIVITY_RANGES) {
      expect(() => rangeStart(option.key, now)).not.toThrow()
    }
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

  it('falls back to the level id, which is the number a user recognises', () => {
    const options = levelOptions([
      makeListItem({ level: makeLevel({ inGameId: '4284013', name: null }) }),
    ])
    expect(options[0]!.name).toBe('4284013')
  })

  it('is empty while the list is still loading', () => {
    expect(levelOptions(undefined)).toEqual([])
  })
})
