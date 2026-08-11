import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER } from '@infernolog/core'
import {
  clampPercent,
  digitsOnly,
  formatNumber,
  maxValueError,
  numberExceedsMax,
} from '../format'
import { GD_22_RELEASE_DATE, isPreTwoTwo } from '../gdVersion'
import { LOGGING_ACTIONS } from '../loggingActions'

describe('digitsOnly', () => {
  it.each([
    ['1a2b3c', '123'],
    ['1,234', '1234'],
    ['12.5', '125'],
    ['-42', '42'],
    ['  7 ', '7'],
    ['4200', '4200'],
  ])('strips %s down to %s', (input, expected) => {
    expect(digitsOnly(input)).toBe(expected)
  })

  it.each([
    ['nothing but text', 'abc'],
    ['an empty string', ''],
  ])('leaves %s empty', (_label, input) => {
    expect(digitsOnly(input)).toBe('')
  })

  it('keeps leading zeros, which the caller decides about', () => {
    expect(digitsOnly('007')).toBe('007')
  })
})

describe('clampPercent', () => {
  it.each([
    ['0', '0'],
    ['50', '50'],
    ['100', '100'],
  ])('passes %s through untouched', (input, expected) => {
    expect(clampPercent(input)).toBe(expected)
  })

  // A percentage is trivially bounded, so clamping as the user types is
  // predictable — unlike the uncapped fields, there is no legitimately larger
  // value being silently destroyed.
  it.each(['101', '999', '1000'])('clamps %s to 100', (input) => {
    expect(clampPercent(input)).toBe('100')
  })

  it('strips non-digits before clamping', () => {
    expect(clampPercent('8a7')).toBe('87')
  })

  it('normalizes leading zeros away', () => {
    expect(clampPercent('007')).toBe('7')
  })

  it.each(['', 'abc'])('leaves %s empty rather than zero', (input) => {
    expect(clampPercent(input)).toBe('')
  })
})

describe('numberExceedsMax', () => {
  it('accepts a value at the bound', () => {
    expect(numberExceedsMax('100', 100)).toBe(false)
  })

  it('rejects a value over it', () => {
    expect(numberExceedsMax('101', 100)).toBe(true)
  })

  // These fields are all optional, so blank is valid — not "zero".
  it('treats an empty value as valid', () => {
    expect(numberExceedsMax('', 100)).toBe(false)
  })

  it('catches a pasted huge number', () => {
    expect(numberExceedsMax('999999999999', MAX_ATTEMPTS)).toBe(true)
  })
})

describe('maxValueError', () => {
  it('says nothing about a valid value', () => {
    expect(maxValueError('100', 100)).toBeNull()
  })

  it('names the limit when the value is over it', () => {
    expect(maxValueError('101', 100)).toBe('Must be 100 or less')
  })

  // Blocking with a message rather than silently clamping: a huge paste used
  // to vanish into a smaller number with no feedback.
  it('groups a large limit with thousands separators', () => {
    expect(maxValueError('999999999999', MAX_ATTEMPTS)).toBe(
      `Must be ${MAX_ATTEMPTS.toLocaleString('en-US')} or less`
    )
  })

  it.each([MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER])(
    'accepts exactly the bound %s',
    (max) => {
      expect(maxValueError(String(max), max)).toBeNull()
    }
  )

  it.each([MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER])(
    'rejects one past the bound %s',
    (max) => {
      expect(maxValueError(String(max + 1), max)).not.toBeNull()
    }
  )
})

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [4200, '4,200'],
    [1234567, '1,234,567'],
  ])('renders %s as %s', (n, expected) => {
    expect(formatNumber(n)).toBe(expected)
  })

  // Pinned to en-US so the grouping does not follow the runner's locale.
  it('groups in en-US regardless of the reader', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5')
  })
})

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

describe('LOGGING_ACTIONS', () => {
  // The FAB renders actions[0] as its own button, so completion leading is
  // load-bearing rather than cosmetic.
  it('puts logging a completion first', () => {
    expect(LOGGING_ACTIONS[0]).toMatchObject({
      key: 'completion',
      path: 'completion',
    })
  })

  it('declares each action exactly once', () => {
    const keys = LOGGING_ACTIONS.map((a) => a.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every action a label and an icon', () => {
    for (const action of LOGGING_ACTIONS) {
      expect(action.label).toBeTruthy()
      expect(action.icon).toBeTruthy()
    }
  })

  it('offers all three logging paths', () => {
    const paths = LOGGING_ACTIONS.map((a) => a.path).filter(Boolean)

    expect(paths).toEqual(['completion', 'progress', 'drop'])
  })

  // The two collection actions open dialogs rather than the logging flow, so
  // they carry no path.
  it('leaves the collection actions pathless', () => {
    const pathless = LOGGING_ACTIONS.filter((a) => !a.path).map((a) => a.key)

    expect(pathless).toEqual(['want-to-beat', 'add-to-list'])
  })
})
