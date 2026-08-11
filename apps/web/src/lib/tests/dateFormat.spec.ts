import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatEntryDateTime,
  formatTimeOfDay,
} from '../dateFormat'

describe('formatDate', () => {
  it.each([
    ['MDY', '03/14/2026'],
    ['DMY', '14/03/2026'],
    ['ISO', '2026-03-14'],
    ['YMD', '2026/03/14'],
  ] as const)('renders %s order', (preference, expected) => {
    expect(formatDate('2026-03-14', preference)).toBe(expected)
  })

  it('falls back to US order for an unrecognised preference', () => {
    expect(formatDate('2026-03-14', 'nonsense' as never)).toBe('03/14/2026')
  })

  // The whole reason this reads the string rather than building a Date: a
  // date-only value must not slide a day for a viewer behind UTC.
  it.each([
    ['a bare calendar date', '2026-03-14'],
    ['a UTC-midnight ISO string', '2026-03-14T00:00:00Z'],
    ['a UTC-midnight ISO string with millis', '2026-03-14T00:00:00.000Z'],
  ])('reads %s straight off the string', (_label, value) => {
    expect(formatDate(value, 'ISO')).toBe('2026-03-14')
  })

  // A real timestamp is a moment, not a calendar date, so it renders in the
  // viewer's local components. TZ is pinned to UTC for the suite.
  it('falls through to local components for a real timestamp', () => {
    expect(formatDate('2026-03-14T18:30:00.000Z', 'ISO')).toBe('2026-03-14')
  })

  it('renders a Date object from its local components', () => {
    expect(formatDate(new Date(2026, 2, 14), 'ISO')).toBe('2026-03-14')
  })

  it('zero-pads single-digit months and days', () => {
    expect(formatDate('2026-01-05', 'MDY')).toBe('01/05/2026')
    expect(formatDate(new Date(2026, 0, 5), 'MDY')).toBe('01/05/2026')
  })

  it('handles the turn of the year', () => {
    expect(formatDate('2026-12-31', 'ISO')).toBe('2026-12-31')
    expect(formatDate('2027-01-01', 'ISO')).toBe('2027-01-01')
  })
})

describe('formatTimeOfDay', () => {
  // ISO users get a 24-hour clock; everyone else gets 12-hour with a period.
  it('renders 24-hour under the ISO preference', () => {
    expect(formatTimeOfDay(18, 30, 'ISO')).toBe('18:30')
    expect(formatTimeOfDay(9, 5, 'ISO')).toBe('09:05')
  })

  it.each(['MDY', 'DMY', 'YMD'] as const)(
    'renders 12-hour under the %s preference',
    (preference) => {
      expect(formatTimeOfDay(18, 30, preference)).toBe('6:30 PM')
    }
  )

  // Midnight and noon are where a naive `hour % 12` renders "0:00".
  it.each([
    [0, 0, '12:00 AM'],
    [0, 30, '12:30 AM'],
    [12, 0, '12:00 PM'],
    [12, 30, '12:30 PM'],
  ])('renders %s:%s as %s', (hour, minute, expected) => {
    expect(formatTimeOfDay(hour, minute, 'MDY')).toBe(expected)
  })

  it.each([
    [11, 59, '11:59 AM'],
    [13, 0, '1:00 PM'],
    [23, 59, '11:59 PM'],
  ])('renders %s:%s as %s', (hour, minute, expected) => {
    expect(formatTimeOfDay(hour, minute, 'MDY')).toBe(expected)
  })

  it('zero-pads the minutes but not the 12-hour', () => {
    expect(formatTimeOfDay(9, 5, 'MDY')).toBe('9:05 AM')
  })
})

describe('formatEntryDateTime', () => {
  const VIEWER = 'America/New_York'

  it('renders nothing at all for an entry with no date', () => {
    expect(formatEntryDateTime(null, 'UTC', 'ISO', VIEWER)).toEqual({
      dateText: '',
      timeText: null,
      showZoneBadge: false,
      zoneLabel: null,
    })
  })

  // A null zone is the convention-wide signal for "no time was entered",
  // which is the common case and the legacy shape.
  describe('an entry with no time of day', () => {
    const result = () => formatEntryDateTime('2026-03-14', null, 'ISO', VIEWER)

    it('renders a bare calendar date', () => {
      expect(result().dateText).toBe('2026-03-14')
    })

    it('renders no time and no zone badge', () => {
      expect(result().timeText).toBeNull()
      expect(result().zoneLabel).toBeNull()
      expect(result().showZoneBadge).toBe(false)
    })
  })

  describe('an entry with a time of day', () => {
    // Computed in the ENTRY's zone, not the viewer's, so it shows the same
    // wall clock to everyone.
    it('renders the wall clock of the entry’s own zone', () => {
      const result = formatEntryDateTime(
        '2026-03-15T03:58:00.000Z',
        'America/New_York',
        'ISO',
        'Asia/Tokyo'
      )

      expect(result.dateText).toBe('2026-03-14')
      expect(result.timeText).toBe('23:58')
    })

    it('honours the date preference for both halves', () => {
      const result = formatEntryDateTime(
        '2026-03-14T18:30:00.000Z',
        'UTC',
        'MDY',
        VIEWER
      )

      expect(result.dateText).toBe('03/14/2026')
      expect(result.timeText).toBe('6:30 PM')
    })

    // The badge exists to warn that a time is not in the reader's own zone.
    it('badges an entry from another zone', () => {
      const result = formatEntryDateTime(
        '2026-03-14T18:30:00.000Z',
        'Asia/Tokyo',
        'ISO',
        VIEWER
      )

      expect(result.showZoneBadge).toBe(true)
      expect(result.zoneLabel).toBe('Asia/Tokyo')
    })

    it('shows no badge when the entry is already in the viewer’s zone', () => {
      const result = formatEntryDateTime(
        '2026-03-14T18:30:00.000Z',
        VIEWER,
        'ISO',
        VIEWER
      )

      expect(result.showZoneBadge).toBe(false)
      expect(result.zoneLabel).toBe(VIEWER)
    })

    // A viewer whose own zone genuinely is UTC sees no badge on their UTC
    // entries — the same rule as anyone else, not a special case.
    it('shows no badge to a viewer whose own zone is UTC', () => {
      const result = formatEntryDateTime(
        '2026-03-14T18:30:00.000Z',
        'UTC',
        'ISO',
        'UTC'
      )

      expect(result.showZoneBadge).toBe(false)
    })

    it('accepts a Date object as well as a string', () => {
      const result = formatEntryDateTime(
        new Date('2026-03-14T18:30:00.000Z'),
        'UTC',
        'ISO',
        VIEWER
      )

      expect(result.dateText).toBe('2026-03-14')
      expect(result.timeText).toBe('18:30')
    })
  })

  // Bad stored data must render as absent rather than "Invalid Date".
  it('renders nothing for an unparseable instant', () => {
    expect(formatEntryDateTime('not-a-date', 'UTC', 'ISO', VIEWER)).toEqual({
      dateText: '',
      timeText: null,
      showZoneBadge: false,
      zoneLabel: null,
    })
  })
})
