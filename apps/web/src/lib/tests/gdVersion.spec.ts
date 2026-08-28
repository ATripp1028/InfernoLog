import { describe, expect, it } from 'vitest'
import { GD_22_RELEASE_DATE, isPreTwoTwo } from '../gdVersion'

describe('isPreTwoTwo', () => {
  // A pre-2.2 date pins the percentage basis to 2.1, since 2.2's time-based
  // percentages did not exist yet.
  it.each([
    ['well before the release', '2020-01-01'],
    ['the day before', '2023-12-18'],
  ])('reports %s as pre-2.2', (_label, date) => {
    expect(isPreTwoTwo(date)).toBe(true)
  })

  it.each([
    ['release day itself', GD_22_RELEASE_DATE],
    ['the day after', '2023-12-20'],
    ['well after', '2026-03-14'],
  ])('reports %s as not pre-2.2', (_label, date) => {
    expect(isPreTwoTwo(date)).toBe(false)
  })

  it('reads the calendar date out of a full ISO string', () => {
    expect(isPreTwoTwo('2023-12-18T23:59:59.000Z')).toBe(true)
    expect(isPreTwoTwo('2023-12-19T00:00:00.000Z')).toBe(false)
  })

  // Callers pass whatever the form holds, so a blank date answers "nothing to
  // pin yet" rather than throwing.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
  ])('reports %s as not pre-2.2', (_label, date) => {
    expect(isPreTwoTwo(date)).toBe(false)
  })
})
