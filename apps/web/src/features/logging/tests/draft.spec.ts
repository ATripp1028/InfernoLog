import { describe, expect, it, vi } from 'vitest'

// The draft seeds its timezone from the viewer's. Pin it so the assertions
// below are about the seeding rule rather than the machine running them.
vi.mock('@/lib/timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/timezone')>()),
  getViewerTimezone: () => 'America/New_York',
}))

const { draftFromExistingCompletion, emptyDraft, isSameDayToggleOn } =
  await import('../types')
const { existingCompletion } = await import('./fixtures')

describe('emptyDraft', () => {
  it('starts on today’s date', () => {
    // TZ is pinned to UTC for the suite, so "today" is unambiguous.
    const today = new Date().toISOString().slice(0, 10)

    expect(emptyDraft().date).toBe(today)
  })

  it('seeds both timezones from the viewer’s own', () => {
    const d = emptyDraft()

    expect(d.timezone).toBe('America/New_York')
    expect(d.worstFailTimezone).toBe('America/New_York')
  })

  it('starts with no time of day', () => {
    expect(emptyDraft().time).toBe('')
  })

  it('leaves every optional numeric field blank rather than zero', () => {
    const d = emptyDraft()

    for (const field of [
      'attempts',
      'worstFail',
      'fps',
      'userGddlTier',
      'percentage',
      'runFrom',
      'runTo',
    ] as const) {
      expect(d[field]).toBe('')
    }
  })

  it('leaves every optional choice unset', () => {
    const d = emptyDraft()

    expect(d.difficultyOpinion).toBeNull()
    expect(d.enjoyment).toBeNull()
    expect(d.simpleRating).toBeNull()
    expect(d.percentageVersion).toBeNull()
    expect(d.device).toBeNull()
    expect(d.twoPlayerSolo).toBeNull()
  })

  it('defaults to a public, from-zero, no-coins run', () => {
    const d = emptyDraft()

    expect(d.visibility).toBe('PUBLIC')
    expect(d.progressMode).toBe('from_zero')
    expect(d.coinsCollected).toBe(0)
    expect(d.ratingScores).toEqual({})
  })

  // A function rather than a shared constant, so reopening the flow cannot
  // inherit the previous run's state.
  it('hands out an independent draft each time', () => {
    const first = emptyDraft()
    first.notes = 'edited'
    first.ratingScores.gameplay = 80

    const second = emptyDraft()
    expect(second.notes).toBe('')
    expect(second.ratingScores).toEqual({})
  })
})

// The toggle writes a worst-fail instant exactly one second before the
// completion instant; this reads that back to re-check the box on reopen.
describe('isSameDayToggleOn', () => {
  it('recognizes the one-second-earlier instant it writes', () => {
    expect(
      isSameDayToggleOn(
        '2026-03-14T18:30:00.000Z',
        'UTC',
        '2026-03-14T18:29:59.000Z',
        'UTC'
      )
    ).toBe(true)
  })

  it('rejects an instant that is merely close', () => {
    expect(
      isSameDayToggleOn(
        '2026-03-14T18:30:00.000Z',
        'UTC',
        '2026-03-14T18:29:58.000Z',
        'UTC'
      )
    ).toBe(false)
  })

  it('rejects an instant on the wrong side', () => {
    expect(
      isSameDayToggleOn(
        '2026-03-14T18:30:00.000Z',
        'UTC',
        '2026-03-14T18:30:01.000Z',
        'UTC'
      )
    ).toBe(false)
  })

  // With no time entered both fields are bare dates, so the toggle writes
  // them identical rather than offsetting.
  it('matches two identical bare dates', () => {
    expect(isSameDayToggleOn('2026-03-14', null, '2026-03-14', null)).toBe(true)
  })

  it('rejects two different bare dates', () => {
    expect(isSameDayToggleOn('2026-03-14', null, '2026-03-13', null)).toBe(
      false
    )
  })

  // The toggle always writes matching zones for both fields, so a mismatched
  // pair came from somewhere else (imported or legacy data) and cannot be
  // "toggle on" whatever the timestamps say.
  it.each([
    ['one zoned, one not', 'UTC', null],
    ['two different zones', 'UTC', 'Asia/Tokyo'],
  ])('rejects a mismatched pair with %s', (_label, anchorTz, worstTz) => {
    expect(
      isSameDayToggleOn(
        '2026-03-14T18:30:00.000Z',
        anchorTz,
        '2026-03-14T18:29:59.000Z',
        worstTz
      )
    ).toBe(false)
  })

  it.each([
    ['no anchor date', null, '2026-03-14'],
    ['no worst-fail date', '2026-03-14', null],
    ['neither', null, null],
  ])('rejects %s', (_label, anchor, worstFail) => {
    expect(isSameDayToggleOn(anchor, null, worstFail, null)).toBe(false)
  })
})

describe('draftFromExistingCompletion', () => {
  it('carries the simple fields across', () => {
    const d = draftFromExistingCompletion(
      existingCompletion({
        attempts: 4200,
        fps: 240,
        onStream: true,
        notes: 'gg',
        videoUrl: 'https://youtu.be/x',
        visibility: 'PRIVATE',
        dateUncertain: true,
        device: 'pc',
      })
    )

    expect(d).toMatchObject({
      attempts: '4200',
      fps: '240',
      onStream: true,
      notes: 'gg',
      videoUrl: 'https://youtu.be/x',
      visibility: 'PRIVATE',
      dateUncertain: true,
      device: 'pc',
    })
  })

  // The draft is string-backed while the wire type is numeric, so every
  // number becomes text — and an absent one becomes blank, not "0".
  it.each([
    ['attempts', 'attempts'],
    ['worstFail', 'worstFail'],
    ['fps', 'fps'],
    ['userGddlTier', 'userGddlTier'],
  ] as const)('blanks %s when it was never set', (field, draftField) => {
    const d = draftFromExistingCompletion(existingCompletion({ [field]: null }))

    expect(d[draftField]).toBe('')
  })

  it('blanks the text fields that were never set', () => {
    const d = draftFromExistingCompletion(
      existingCompletion({ notes: null, videoUrl: null, highlightUrl: null })
    )

    expect(d.notes).toBe('')
    expect(d.videoUrl).toBe('')
    expect(d.highlightUrl).toBe('')
  })

  it('turns the stored score list back into a keyed map', () => {
    const d = draftFromExistingCompletion(
      existingCompletion({
        ratingScores: [
          { categoryId: 'gameplay', score: 80 },
          { categoryId: 'design', score: 60 },
        ],
      })
    )

    expect(d.ratingScores).toEqual({ gameplay: 80, design: 60 })
  })

  describe('the session date', () => {
    it('splits a zoned instant into its date and time', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({
          date: '2026-03-14T18:30:00.000Z',
          dateTimezone: 'UTC',
        })
      )

      expect(d.date).toBe('2026-03-14')
      expect(d.time).toBe('18:30')
      expect(d.timezone).toBe('UTC')
    })

    // An entry logged late in the evening is already the next day in UTC, so
    // slicing the raw string would show a date the user never entered.
    it('reads the calendar date in the entry’s own zone', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({
          date: '2026-03-15T03:58:00.000Z',
          dateTimezone: 'America/New_York',
        })
      )

      expect(d.date).toBe('2026-03-14')
      expect(d.time).toBe('23:58')
    })

    // A null zone is the convention for "no time was ever entered".
    it('leaves the time blank for a zone-less entry', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({ date: '2026-03-14', dateTimezone: null })
      )

      expect(d.date).toBe('2026-03-14')
      expect(d.time).toBe('')
    })

    it('falls back to the viewer’s zone when the entry has none', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({ dateTimezone: null })
      )

      expect(d.timezone).toBe('America/New_York')
    })
  })

  describe('the worst-fail date', () => {
    it('splits a zoned instant the same way', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({
          worstFailDate: '2026-03-14T18:30:00.000Z',
          worstFailDateTimezone: 'UTC',
        })
      )

      expect(d.worstFailDate).toBe('2026-03-14')
      expect(d.worstFailTime).toBe('18:30')
      expect(d.worstFailTimezone).toBe('UTC')
    })

    // The draft field is a string, so an absent date is '' rather than null.
    it('blanks a worst fail that was never dated', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({ worstFailDate: null })
      )

      expect(d.worstFailDate).toBe('')
    })

    // Reopening an entry saved with the toggle on must re-check the box.
    it('re-checks the same-day toggle for an entry saved with it', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({
          date: '2026-03-14T18:30:00.000Z',
          dateTimezone: 'UTC',
          worstFailDate: '2026-03-14T18:29:59.000Z',
          worstFailDateTimezone: 'UTC',
        })
      )

      expect(d.worstFailSameDay).toBe(true)
    })

    it('leaves the toggle off for independently dated fields', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({
          date: '2026-03-14T18:30:00.000Z',
          dateTimezone: 'UTC',
          worstFailDate: '2026-01-01T10:00:00.000Z',
          worstFailDateTimezone: 'UTC',
        })
      )

      expect(d.worstFailSameDay).toBe(false)
    })

    // "Already logged" is a fresh-entry shortcut for skipping the worst-fail
    // fields; editing an existing entry always shows what was stored.
    it('never starts an edit with "already logged" checked', () => {
      const d = draftFromExistingCompletion(
        existingCompletion({ worstFail: 94 })
      )

      expect(d.worstFailAlreadyLogged).toBe(false)
    })
  })

  it('survives a completion with nothing set at all', () => {
    expect(() =>
      draftFromExistingCompletion(existingCompletion())
    ).not.toThrow()
  })

  it('leaves an unparseable stored date blank rather than NaN', () => {
    const d = draftFromExistingCompletion(
      existingCompletion({ date: 'not-a-date', dateTimezone: 'UTC' })
    )

    expect(d.date).toBeNull()
    expect(d.time).toBe('')
  })
})
