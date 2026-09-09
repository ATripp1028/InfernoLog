import { describe, expect, it } from 'vitest'
import { formatSongSize } from '../format'

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
