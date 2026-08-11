import { describe, expect, it } from 'vitest'
import { MIN_AGE, calculateAge, isOldEnough } from '../ageCheck'

/** A local date, avoiding the UTC-parsing of a bare 'yyyy-mm-dd' string. */
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('calculateAge', () => {
  it('counts whole years between the two dates', () => {
    expect(calculateAge(on(2000, 3, 14), on(2026, 3, 14))).toBe(26)
  })

  // The birthday itself counts; the day before does not.
  it('turns the age on the birthday', () => {
    expect(calculateAge(on(2000, 3, 14), on(2026, 3, 13))).toBe(25)
    expect(calculateAge(on(2000, 3, 14), on(2026, 3, 14))).toBe(26)
  })

  it('does not count a birthday later this year', () => {
    expect(calculateAge(on(2000, 12, 25), on(2026, 3, 14))).toBe(25)
  })

  it('counts a birthday already passed this year', () => {
    expect(calculateAge(on(2000, 1, 1), on(2026, 3, 14))).toBe(26)
  })

  // The day-of-month comparison only applies within the birth month.
  it('handles a birthday earlier in the same month', () => {
    expect(calculateAge(on(2000, 3, 1), on(2026, 3, 14))).toBe(26)
  })

  it('handles a birthday later in the same month', () => {
    expect(calculateAge(on(2000, 3, 31), on(2026, 3, 14))).toBe(25)
  })

  it('reads a birthdate today as zero', () => {
    expect(calculateAge(on(2026, 3, 14), on(2026, 3, 14))).toBe(0)
  })

  // A future date is nonsense input, but it must not read as old enough.
  it('reports a future birthdate as negative', () => {
    expect(calculateAge(on(2030, 1, 1), on(2026, 3, 14))).toBeLessThan(0)
  })

  it('handles a leap-day birthdate in a non-leap year', () => {
    expect(calculateAge(on(2000, 2, 29), on(2026, 2, 28))).toBe(25)
    expect(calculateAge(on(2000, 2, 29), on(2026, 3, 1))).toBe(26)
  })
})

describe('isOldEnough', () => {
  const today = on(2026, 3, 14)

  it('accepts someone comfortably over the minimum', () => {
    expect(isOldEnough(on(2000, 1, 1), today)).toBe(true)
  })

  // The boundary is the whole point of the gate.
  it('accepts someone exactly on their qualifying birthday', () => {
    expect(isOldEnough(on(2026 - MIN_AGE, 3, 14), today)).toBe(true)
  })

  it('rejects someone one day short of it', () => {
    expect(isOldEnough(on(2026 - MIN_AGE, 3, 15), today)).toBe(false)
  })

  it('rejects someone clearly under', () => {
    expect(isOldEnough(on(2020, 1, 1), today)).toBe(false)
  })

  it('rejects a future birthdate', () => {
    expect(isOldEnough(on(2030, 1, 1), today)).toBe(false)
  })
})
