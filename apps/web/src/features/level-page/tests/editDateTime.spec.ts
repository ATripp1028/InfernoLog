import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { toast } = await import('@/components/generic/sonner')
const { composeZonedDate, zonedDateTimeInput } = await import('../editDateTime')

beforeEach(() => {
  vi.mocked(toast.error).mockClear()
})

describe('zonedDateTimeInput', () => {
  it('reads back the calendar date and time in the zone it was entered in', () => {
    expect(zonedDateTimeInput('2026-03-14T15:30:00.000Z', 'UTC')).toEqual({
      date: '2026-03-14',
      time: '15:30',
    })
  })

  // The reason this exists at all: an entry logged late in the evening in a
  // negative-UTC zone is already the NEXT day in UTC, so slicing the raw ISO
  // string would show the user a date they never typed.
  it('does not roll a late-evening entry into the next day', () => {
    const { date, time } = zonedDateTimeInput(
      '2026-03-15T03:58:00.000Z',
      'America/New_York'
    )

    expect(date).toBe('2026-03-14')
    expect(time).toBe('23:58')
  })

  it('does not roll an early-morning entry back a day either', () => {
    const { date, time } = zonedDateTimeInput(
      '2026-03-13T22:30:00.000Z',
      'Asia/Tokyo'
    )

    expect(date).toBe('2026-03-14')
    expect(time).toBe('07:30')
  })

  it('zero-pads the parts it renders', () => {
    expect(zonedDateTimeInput('2026-01-05T04:07:00.000Z', 'UTC')).toEqual({
      date: '2026-01-05',
      time: '04:07',
    })
  })

  // A null zone is the convention for "no time-of-day was ever entered", so
  // the stored value is a bare calendar date with no instant to resolve.
  it('slices a dateless entry without inventing a time', () => {
    expect(zonedDateTimeInput('2026-03-14', null)).toEqual({
      date: '2026-03-14',
      time: '',
    })
  })

  it('slices the date out of a full ISO string when there is no zone', () => {
    expect(zonedDateTimeInput('2026-03-14T23:58:00.000Z', null).date).toBe(
      '2026-03-14'
    )
  })

  it.each([
    ['a cleared field', null],
    ['an empty string', ''],
  ])('returns blank inputs for %s', (_label, iso) => {
    expect(zonedDateTimeInput(iso, 'UTC')).toEqual({ date: '', time: '' })
  })

  it('returns blank inputs rather than NaN for an unparseable instant', () => {
    expect(zonedDateTimeInput('not-a-date', 'UTC')).toEqual({
      date: '',
      time: '',
    })
  })
})

describe('composeZonedDate', () => {
  it('composes a date, a time, and a zone into a stored instant', () => {
    expect(composeZonedDate('2026-03-14', '15:30', 'UTC')).toEqual({
      date: '2026-03-14T15:30:00.000Z',
      dateTimezone: 'UTC',
    })
  })

  it('shifts a zoned time to the right UTC instant', () => {
    expect(composeZonedDate('2026-03-14', '23:58', 'America/New_York')).toEqual(
      {
        date: '2026-03-15T03:58:00.000Z',
        dateTimezone: 'America/New_York',
      }
    )
  })

  // No time means no instant to anchor, so the bare date is stored and the
  // zone is dropped — that null zone is what marks it as time-less.
  it('stores a bare date with no zone when no time was entered', () => {
    expect(composeZonedDate('2026-03-14', '', 'America/New_York')).toEqual({
      date: '2026-03-14',
      dateTimezone: null,
    })
  })

  it('clears both fields when the date was cleared', () => {
    expect(composeZonedDate(null, '15:30', 'UTC')).toEqual({
      date: null,
      dateTimezone: null,
    })
  })

  it('round-trips a zoned instant through the input helper', () => {
    const stored = composeZonedDate('2026-03-14', '23:58', 'America/New_York')
    if (stored === 'invalid') throw new Error('unexpectedly invalid')

    expect(zonedDateTimeInput(stored.date, stored.dateTimezone)).toEqual({
      date: '2026-03-14',
      time: '23:58',
    })
  })

  // The hour that DST skips does not exist, so there is no instant to store.
  // The caller has to bail out of its save rather than write something wrong.
  describe('a time that daylight saving skipped', () => {
    // On 2026-03-08 America/New_York jumps 02:00 → 03:00.
    const skipped = () =>
      composeZonedDate('2026-03-08', '02:30', 'America/New_York')

    it('reports the entry as invalid', () => {
      expect(skipped()).toBe('invalid')
    })

    it('tells the user why, naming daylight saving', () => {
      skipped()

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('daylight saving')
      )
    })

    it('accepts the hour either side of the gap', () => {
      expect(
        composeZonedDate('2026-03-08', '01:30', 'America/New_York')
      ).not.toBe('invalid')
      expect(
        composeZonedDate('2026-03-08', '03:30', 'America/New_York')
      ).not.toBe('invalid')
    })
  })
})
