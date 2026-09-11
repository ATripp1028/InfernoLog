import { describe, expect, it } from 'vitest'
import { formatEnjoyment, formatSongSize } from '../format'

describe('formatSongSize', () => {
  it.each([
    [9.56, '9.56 MB'],
    [10, '10.00 MB'],
    [0.5, '0.50 MB'],
  ])('renders %s MB as %s', (mb, expected) => {
    expect(formatSongSize(mb)).toBe(expected)
  })

  it('always shows two decimals, rounding the raw float', () => {
    expect(formatSongSize(9.567)).toBe('9.57 MB')
    expect(formatSongSize(9.564)).toBe('9.56 MB')
  })

  // A zero-byte song is still a known size — distinct from an unknown one,
  // which the caller renders as an absent row rather than "0.00 MB".
  it('renders a zero size rather than treating it as absent', () => {
    expect(formatSongSize(0)).toBe('0.00 MB')
  })

  it('returns null for an unknown size', () => {
    expect(formatSongSize(null)).toBeNull()
  })
})

describe('formatEnjoyment', () => {
  it.each([
    // Up to two decimals, as EDEL displays — trailing zeros dropped.
    [59.39, '59.39'],
    [59.39285714, '59.39'],
    [49.5, '49.5'],
    [50, '50'],
    // A zero score is a real rating, distinct from having none.
    [0, '0'],
    [100, '100'],
  ])('renders %s as %s', (value, expected) => {
    expect(formatEnjoyment(value)).toBe(expected)
  })

  it.each([
    ['null', null],
    ['a non-finite number', Number.NaN],
  ])('returns null for %s', (_label, value) => {
    expect(formatEnjoyment(value)).toBeNull()
  })
})
