/**
 * Unit tests for zonedDateString.
 *
 * The whole point of this helper is that the UTC calendar day and the day the
 * user actually experienced can differ — so the tests use instants that fall on
 * opposite sides of midnight in the target zone. A regression here silently
 * shifts logged dates by a day in export and import dedup.
 */

import { describe, expect, it } from 'vitest'
import { zonedDateString } from './timezone'

describe('zonedDateString — no timezone', () => {
  it('takes a plain UTC slice when the timezone is null', () => {
    // Null means no time-of-day was entered, so the instant is midnight UTC by
    // convention and the raw slice is already the intended day.
    expect(zonedDateString(new Date('2026-08-12T00:00:00Z'), null)).toBe(
      '2026-08-12'
    )
  })

  it('does not shift a null-timezone date even when the time is late', () => {
    expect(zonedDateString(new Date('2026-08-12T23:59:59Z'), null)).toBe(
      '2026-08-12'
    )
  })
})

describe('zonedDateString — with a timezone', () => {
  it('rolls back a day for a zone behind UTC', () => {
    // 02:00 UTC is still the 11th in New York (UTC-4 in August).
    expect(
      zonedDateString(new Date('2026-08-12T02:00:00Z'), 'America/New_York')
    ).toBe('2026-08-11')
  })

  it('rolls forward a day for a zone ahead of UTC', () => {
    // 23:00 UTC is already the 12th in Tokyo (UTC+9).
    expect(
      zonedDateString(new Date('2026-08-11T23:00:00Z'), 'Asia/Tokyo')
    ).toBe('2026-08-12')
  })

  it('agrees with the UTC slice when the instant does not cross midnight', () => {
    expect(
      zonedDateString(new Date('2026-08-12T12:00:00Z'), 'America/New_York')
    ).toBe('2026-08-12')
  })

  it('formats as zero-padded yyyy-MM-dd', () => {
    expect(
      zonedDateString(new Date('2026-01-05T12:00:00Z'), 'Europe/London')
    ).toBe('2026-01-05')
  })

  it('handles UTC itself as an explicit zone', () => {
    expect(zonedDateString(new Date('2026-08-12T00:00:00Z'), 'UTC')).toBe(
      '2026-08-12'
    )
  })

  it('returns the same answer on repeat calls (formatter is cached)', () => {
    const date = new Date('2026-08-12T02:00:00Z')
    const first = zonedDateString(date, 'America/New_York')
    expect(zonedDateString(date, 'America/New_York')).toBe(first)
  })
})

describe('zonedDateString — invalid zones', () => {
  it.each([
    ['a nonsense zone', 'Not/AZone'],
    ['an empty-ish zone', ' '],
    ['a legacy abbreviation', 'EST5EDT_BOGUS'],
  ])('falls back to the UTC slice for %s instead of throwing', (_label, tz) => {
    // Stale rows predate zone validation; a bad value must degrade, not crash.
    const date = new Date('2026-08-12T02:00:00Z')
    expect(() => zonedDateString(date, tz)).not.toThrow()
    expect(zonedDateString(date, tz)).toBe('2026-08-12')
  })
})
