import { describe, expect, it, vi } from 'vitest'

// The module reads the viewer's zone once, at import. Pin it so the
// zone-badge rule (badge iff the entry's zone differs from the viewer's) is
// decided by the test rather than by the machine running it — the suite's
// TZ=UTC would otherwise make "same zone as viewer" mean UTC everywhere.
vi.mock('@/lib/timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/timezone')>()),
  getViewerTimezone: () => 'America/New_York',
}))

const { formatEntryDate, rangeLabel } = await import('../timelineFormat')
const { progressUpdate } = await import('./fixtures')

describe('rangeLabel', () => {
  // A completion is 100% by definition, whatever the row happens to store.
  it('always reads 100% for a completion', () => {
    expect(
      rangeLabel(
        progressUpdate({ kind: 'COMPLETION', percentage: 42, runFrom: 10 })
      )
    ).toBe('100%')
  })

  it('describes a run by its range', () => {
    expect(
      rangeLabel(progressUpdate({ runFrom: 30, runTo: 75, percentage: null }))
    ).toBe('run 30 → 75%')
  })

  // A run range is more specific than a bare percentage, so it wins when the
  // entry carries both.
  it('prefers the run range over a bare percentage', () => {
    expect(
      rangeLabel(progressUpdate({ runFrom: 30, runTo: 75, percentage: 75 }))
    ).toBe('run 30 → 75%')
  })

  it('falls back to the percentage when only one end of a run is known', () => {
    expect(
      rangeLabel(progressUpdate({ runFrom: 30, runTo: null, percentage: 42 }))
    ).toBe('42%')
  })

  it('renders a plain percentage', () => {
    expect(
      rangeLabel(progressUpdate({ percentage: 42, runFrom: null, runTo: null }))
    ).toBe('42%')
  })

  // Zero is a real percentage and must not read as "nothing recorded".
  it('renders a zero percentage rather than an em dash', () => {
    expect(
      rangeLabel(progressUpdate({ percentage: 0, runFrom: null, runTo: null }))
    ).toBe('0%')
  })

  it('renders a run starting at zero', () => {
    expect(rangeLabel(progressUpdate({ runFrom: 0, runTo: 61 }))).toBe(
      'run 0 → 61%'
    )
  })

  it('falls back to an em dash when nothing was recorded', () => {
    expect(
      rangeLabel(
        progressUpdate({ percentage: null, runFrom: null, runTo: null })
      )
    ).toBe('—')
  })

  it('reads a drop by its percentage, like any other entry', () => {
    expect(rangeLabel(progressUpdate({ kind: 'DROP', percentage: 61 }))).toBe(
      '61%'
    )
  })
})

describe('formatEntryDate', () => {
  const LOGGED_AT = '2026-06-01T12:00:00.000Z'

  it('renders the entry date in the chosen format', () => {
    const result = formatEntryDate('2026-03-14', null, LOGGED_AT, false, 'MDY')

    expect(result.text).toBe('03/14/2026')
  })

  it.each([
    ['DMY', '14/03/2026'],
    ['ISO', '2026-03-14'],
  ] as const)('honours the %s preference', (pref, expected) => {
    expect(
      formatEntryDate('2026-03-14', null, LOGGED_AT, false, pref).text
    ).toBe(expected)
  })

  // A null zone is the convention for "no time-of-day was ever entered",
  // which is the common case and renders as a bare date.
  it('renders a zone-less entry as a bare date', () => {
    const result = formatEntryDate('2026-03-14', null, LOGGED_AT, false, 'MDY')

    expect(result.timeText).toBeNull()
    expect(result.zoneSuffix).toBeNull()
  })

  it('renders the time when the entry carries a zone', () => {
    const result = formatEntryDate(
      '2026-03-14T18:30:00.000Z',
      'UTC',
      LOGGED_AT,
      false,
      'ISO'
    )

    expect(result.text).toBe('2026-03-14')
    expect(result.timeText).not.toBeNull()
  })

  // The badge exists to warn that a time is not in the reader's own zone.
  it('badges an entry logged in a zone other than the viewer’s', () => {
    const result = formatEntryDate(
      '2026-03-14T18:30:00.000Z',
      'Asia/Tokyo',
      LOGGED_AT,
      false,
      'ISO'
    )

    expect(result.zoneSuffix).toBe('Asia/Tokyo')
  })

  it('shows no badge when the entry is already in the viewer’s zone', () => {
    const result = formatEntryDate(
      '2026-03-14T18:30:00.000Z',
      'America/New_York',
      LOGGED_AT,
      false,
      'ISO'
    )

    expect(result.zoneSuffix).toBeNull()
    expect(result.timeText).not.toBeNull()
  })

  // The date is resolved in the entry's own zone, so a late-evening entry
  // does not display as the following day.
  it('renders the calendar date of the entry’s zone, not of UTC', () => {
    const result = formatEntryDate(
      '2026-03-15T03:58:00.000Z',
      'America/New_York',
      LOGGED_AT,
      false,
      'ISO'
    )

    expect(result.text).toBe('2026-03-14')
  })

  it('carries the uncertain flag through', () => {
    expect(
      formatEntryDate('2026-03-14', null, LOGGED_AT, true, 'MDY').uncertain
    ).toBe(true)
  })

  // An entry with no date at all falls back to when it was logged — which is
  // a fact about the record, not a claim about when the run happened, so it
  // is never marked uncertain.
  describe('an entry with no date of its own', () => {
    const noDate = () => formatEntryDate(null, null, LOGGED_AT, true, 'ISO')

    it('falls back to the logged-at timestamp', () => {
      expect(noDate().text).toBe('2026-06-01')
    })

    it('never renders as uncertain, whatever the flag said', () => {
      expect(noDate().uncertain).toBe(false)
    })

    it('renders no time and no zone badge', () => {
      expect(noDate().timeText).toBeNull()
      expect(noDate().zoneSuffix).toBeNull()
    })

    it('ignores any zone that came with the missing date', () => {
      const result = formatEntryDate(
        null,
        'Asia/Tokyo',
        LOGGED_AT,
        false,
        'ISO'
      )

      expect(result.zoneSuffix).toBeNull()
    })
  })
})
