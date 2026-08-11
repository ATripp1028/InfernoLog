import { describe, expect, it } from 'vitest'
import {
  NonexistentLocalTimeError,
  getViewerTimezone,
  getZonedParts,
  supportedTimeZones,
  zonedTimeToUtc,
} from '../timezone'

describe('getViewerTimezone', () => {
  // The suite pins TZ=UTC (vitest.config.ts), so this is deterministic here.
  it('reports the environment’s own zone', () => {
    expect(getViewerTimezone()).toBe('UTC')
  })
})

describe('supportedTimeZones', () => {
  it('lists real IANA names', () => {
    const zones = supportedTimeZones()

    expect(zones.length).toBeGreaterThan(0)
    expect(zones).toContain('America/New_York')
    expect(zones).toContain('Asia/Tokyo')
  })

  // Every name it offers has to be usable by the converters, or the timezone
  // picker could hand back something that throws downstream.
  it('offers only zones the converters accept', () => {
    for (const zone of supportedTimeZones().slice(0, 50)) {
      expect(() => getZonedParts(new Date(), zone)).not.toThrow()
    }
  })
})

describe('getZonedParts', () => {
  const instant = new Date('2026-03-14T18:30:00.000Z')

  it('reads the wall clock in UTC', () => {
    expect(getZonedParts(instant, 'UTC')).toEqual({
      year: 2026,
      month: 3,
      day: 14,
      hour: 18,
      minute: 30,
    })
  })

  // The point of the module: an entry shows the same local time to every
  // viewer rather than being reinterpreted into the viewer's own zone.
  it('reads the wall clock behind UTC', () => {
    expect(getZonedParts(instant, 'America/New_York')).toMatchObject({
      day: 14,
      hour: 14,
      minute: 30,
    })
  })

  it('reads the wall clock ahead of UTC', () => {
    expect(getZonedParts(instant, 'Asia/Tokyo')).toMatchObject({
      day: 15,
      hour: 3,
      minute: 30,
    })
  })

  // Months are 1-12 here, not the Date object's 0-11 — getting this wrong
  // would silently shift every displayed date by a month.
  it('reports months from one, not zero', () => {
    expect(getZonedParts(new Date('2026-01-15T12:00:00.000Z'), 'UTC').month).toBe(
      1
    )
    expect(
      getZonedParts(new Date('2026-12-15T12:00:00.000Z'), 'UTC').month
    ).toBe(12)
  })

  // A late-evening instant is already the next day in UTC, which is the case
  // that made naive string-slicing wrong.
  it('rolls the calendar date back across midnight', () => {
    expect(
      getZonedParts(new Date('2026-03-15T03:58:00.000Z'), 'America/New_York')
    ).toMatchObject({ year: 2026, month: 3, day: 14, hour: 23, minute: 58 })
  })

  it('handles a half-hour offset zone', () => {
    expect(getZonedParts(instant, 'Asia/Kolkata')).toMatchObject({
      hour: 0,
      minute: 0,
      day: 15,
    })
  })

  // Write-time validation catches bad zones now, but pre-existing rows (or a
  // non-web caller) can still carry one — falling back beats crashing every
  // viewer of that entry.
  it('falls back to UTC for an unknown zone rather than throwing', () => {
    expect(() => getZonedParts(instant, 'Not/AZone')).not.toThrow()
    expect(getZonedParts(instant, 'Not/AZone')).toEqual(
      getZonedParts(instant, 'UTC')
    )
  })

  it('keeps falling back on a second call, from cache', () => {
    expect(getZonedParts(instant, 'Also/Bogus')).toEqual(
      getZonedParts(instant, 'Also/Bogus')
    )
  })
})

describe('zonedTimeToUtc', () => {
  it('converts a UTC wall clock to the same instant', () => {
    expect(zonedTimeToUtc('2026-03-14', '18:30', 'UTC').toISOString()).toBe(
      '2026-03-14T18:30:00.000Z'
    )
  })

  it('shifts a zone behind UTC forward', () => {
    expect(
      zonedTimeToUtc('2026-03-14', '14:30', 'America/New_York').toISOString()
    ).toBe('2026-03-14T18:30:00.000Z')
  })

  it('shifts a zone ahead of UTC backward', () => {
    expect(
      zonedTimeToUtc('2026-03-15', '03:30', 'Asia/Tokyo').toISOString()
    ).toBe('2026-03-14T18:30:00.000Z')
  })

  it('handles a half-hour offset zone', () => {
    expect(
      zonedTimeToUtc('2026-03-15', '00:00', 'Asia/Kolkata').toISOString()
    ).toBe('2026-03-14T18:30:00.000Z')
  })

  it('crosses midnight into the previous UTC day', () => {
    expect(
      zonedTimeToUtc('2026-03-14', '23:58', 'America/New_York').toISOString()
    ).toBe('2026-03-15T03:58:00.000Z')
  })

  // Round-tripping is the real contract: whatever the user typed has to come
  // back as the same wall clock.
  it.each([
    ['UTC', '2026-03-14', '18:30'],
    ['America/New_York', '2026-03-14', '23:58'],
    ['Asia/Tokyo', '2026-01-01', '00:00'],
    ['Asia/Kolkata', '2026-06-15', '12:45'],
    ['Australia/Sydney', '2026-09-30', '09:15'],
    ['America/Sao_Paulo', '2026-02-14', '21:00'],
  ])('round-trips %s %s %s', (zone, date, time) => {
    const parts = getZonedParts(zonedTimeToUtc(date, time, zone), zone)
    const [y, mo, d] = date.split('-').map(Number)
    const [h, mi] = time.split(':').map(Number)

    expect(parts).toEqual({
      year: y,
      month: mo,
      day: d,
      hour: h,
      minute: mi,
    })
  })

  // The offset correction runs twice precisely so a first guess landing on
  // the wrong side of a transition still converges.
  describe('around a daylight-saving transition', () => {
    it('converts the hour before the spring-forward gap', () => {
      const d = zonedTimeToUtc('2026-03-08', '01:30', 'America/New_York')

      expect(getZonedParts(d, 'America/New_York')).toMatchObject({
        hour: 1,
        minute: 30,
      })
    })

    it('converts the hour after the gap', () => {
      const d = zonedTimeToUtc('2026-03-08', '03:30', 'America/New_York')

      expect(getZonedParts(d, 'America/New_York')).toMatchObject({
        hour: 3,
        minute: 30,
      })
    })

    // 2:30 AM never happened that day. There is no correct instant, so this
    // throws rather than silently storing one that redisplays as 1:30 or 3:30.
    it('refuses a local time that never occurred', () => {
      expect(() =>
        zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York')
      ).toThrow(NonexistentLocalTimeError)
    })

    it('names the date, the time, and the zone in the error', () => {
      try {
        zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect((err as Error).message).toContain('02:30')
        expect((err as Error).message).toContain('2026-03-08')
        expect((err as Error).message).toContain('America/New_York')
        expect((err as Error).name).toBe('NonexistentLocalTimeError')
      }
    })

    it('refuses the gap in a southern-hemisphere zone too', () => {
      // Australia/Sydney springs forward 02:00 → 03:00 on 2026-10-04.
      expect(() =>
        zonedTimeToUtc('2026-10-04', '02:30', 'Australia/Sydney')
      ).toThrow(NonexistentLocalTimeError)
    })

    // The fall-back overlap happens twice; it resolves to the earlier
    // occurrence rather than throwing, matching most date libraries.
    it('accepts an ambiguous time from the autumn overlap', () => {
      const d = zonedTimeToUtc('2026-11-01', '01:30', 'America/New_York')

      expect(getZonedParts(d, 'America/New_York')).toMatchObject({
        hour: 1,
        minute: 30,
      })
    })
  })

  it('falls back to UTC for an unknown zone', () => {
    expect(
      zonedTimeToUtc('2026-03-14', '18:30', 'Not/AZone').toISOString()
    ).toBe('2026-03-14T18:30:00.000Z')
  })

  it('handles midnight and the last minute of the day', () => {
    expect(
      zonedTimeToUtc('2026-03-14', '00:00', 'UTC').toISOString()
    ).toBe('2026-03-14T00:00:00.000Z')
    expect(
      zonedTimeToUtc('2026-03-14', '23:59', 'UTC').toISOString()
    ).toBe('2026-03-14T23:59:00.000Z')
  })
})
