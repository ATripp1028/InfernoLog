import { describe, expect, it } from 'vitest'
import { MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER } from '@infernolog/core'
import {
  clampPercent,
  digitsOnly,
  formatNumber,
  maxValueError,
  numberExceedsMax,
} from '../numberFormat'

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
