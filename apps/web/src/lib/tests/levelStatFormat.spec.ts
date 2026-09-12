import { describe, expect, it } from 'vitest'
import {
  formatCommunityEnjoyment,
  formatDuration,
  parseDuration,
} from '../levelStatFormat'

describe('formatDuration', () => {
  it.each([
    [121, '2:01'],
    [60, '1:00'],
    [59, '0:59'],
    // A zero-second reading is a known duration, not an absent one.
    [0, '0:00'],
    // Hours appear only when there are any — "0:02:01" reads as a stopwatch.
    [3600, '1:00:00'],
    [3849, '1:04:09'],
  ])('renders %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })

  it('rounds a fractional duration to the nearest second', () => {
    expect(formatDuration(121.4)).toBe('2:01')
    expect(formatDuration(121.6)).toBe('2:02')
  })

  // null is the caller's cue to fall back to RobTop's band, so a nonsense value
  // has to reach it the same way rather than rendering "NaN:aN".
  it.each([
    ['null', null],
    ['a negative', -5],
    ['a non-finite number', Number.NaN],
  ])('returns null for %s', (_label, value) => {
    expect(formatDuration(value)).toBeNull()
  })
})

describe('parseDuration', () => {
  it.each([
    ['2:01', 121],
    ['0:59', 59],
    ['1:04:09', 3849],
    // Bare digits are seconds, so a pasted raw figure still reads.
    ['90', 90],
    ['0', 0],
    ['  1:30  ', 90],
  ])('reads %p as %s seconds', (text, expected) => {
    expect(parseDuration(text)).toBe(expected)
  })

  // What the box displays has to come back through unchanged.
  it.each([0, 59, 121, 3849])('round-trips %s through formatDuration', (s) => {
    expect(parseDuration(formatDuration(s)!)).toBe(s)
  })

  // A clock field of 60 or more is a typo, not a carry — reading "1:75" as
  // 2:15 would silently filter on a duration nobody typed.
  it.each(['1:75', '1:60:00', '0:60'])('rejects the overflowing %p', (text) => {
    expect(parseDuration(text)).toBeNull()
  })

  it.each(['', 'abc', '1:', ':30', '1:2:3:4', '-5', '1.5'])(
    'rejects %p',
    (text) => {
      expect(parseDuration(text)).toBeNull()
    }
  )
})

describe('formatCommunityEnjoyment', () => {
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
    expect(formatCommunityEnjoyment(value)).toBe(expected)
  })

  it.each([
    ['null', null],
    ['a non-finite number', Number.NaN],
  ])('returns null for %s', (_label, value) => {
    expect(formatCommunityEnjoyment(value)).toBeNull()
  })
})
