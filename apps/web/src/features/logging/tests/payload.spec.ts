import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/client'
import { NonexistentLocalTimeError } from '@/lib/timezone'
import {
  buildCompletionInput,
  buildDropInput,
  buildProgressInput,
  loggingErrorMessage,
} from '../payload'
import { draft, level, me } from './fixtures'

describe('loggingErrorMessage', () => {
  // The DST gap is the one failure the user can actually fix, so it gets its
  // own instruction rather than the API's wording.
  it('explains a time that daylight saving skipped', () => {
    expect(
      loggingErrorMessage(
        new NonexistentLocalTimeError(
          '2026-03-08',
          '02:30',
          'America/New_York'
        ),
        'fallback'
      )
    ).toContain('daylight saving')
  })

  it('surfaces an API message as-is', () => {
    expect(
      loggingErrorMessage(new ApiError(409, 'Already logged'), 'fallback')
    ).toBe('Already logged')
  })

  it.each([
    ['a plain error', new Error('boom')],
    ['a thrown string', 'boom'],
    ['nothing at all', undefined],
  ])('falls back to the caller’s copy for %s', (_label, err) => {
    expect(loggingErrorMessage(err, 'Could not save')).toBe('Could not save')
  })
})

describe('buildCompletionInput', () => {
  const build = (
    d: Parameters<typeof draft>[0] = {},
    l: Parameters<typeof level>[0] = {},
    m: Parameters<typeof me>[0] = {}
  ) => buildCompletionInput(level(l), draft(d), me(m))

  it('identifies the level it is logging', () => {
    expect(build({}, { inGameId: '999' }).levelId).toBe('999')
  })

  // The draft is text-shaped so the inputs can hold what the user typed; the
  // wire type is numeric.
  it('converts the numeric fields out of their text form', () => {
    const input = build({ attempts: '4200', worstFail: '94', fps: '240' })

    expect(input.attempts).toBe(4200)
    expect(input.worstFail).toBe(94)
    expect(input.fps).toBe(240)
  })

  it.each(['attempts', 'worstFail'] as const)(
    'sends null for a blank %s',
    (field) => {
      expect(build({ [field]: '' })[field]).toBeNull()
    }
  )

  it('trims the free-text fields, sending null when nothing is left', () => {
    const input = build({ notes: '  ', videoUrl: '  x  ', highlightUrl: '' })

    expect(input.notes).toBeNull()
    expect(input.videoUrl).toBe('x')
    expect(input.highlightUrl).toBeNull()
  })

  describe('the session date', () => {
    // No time entered means the legacy shape: a bare date with no zone. That
    // null zone is the convention for "no time of day".
    it('sends a bare date when no time was entered', () => {
      const input = build({ date: '2026-03-14', time: '' })

      expect(input.date).toBe('2026-03-14')
      expect(input.dateTimezone).toBeNull()
    })

    it('converts a date and time to the right instant', () => {
      const input = build({
        date: '2026-03-14',
        time: '18:30',
        timezone: 'UTC',
      })

      expect(input.date).toBe('2026-03-14T18:30:00.000Z')
      expect(input.dateTimezone).toBe('UTC')
    })

    it('shifts a zoned time to UTC', () => {
      const input = build({
        date: '2026-03-14',
        time: '23:58',
        timezone: 'America/New_York',
      })

      expect(input.date).toBe('2026-03-15T03:58:00.000Z')
      expect(input.dateTimezone).toBe('America/New_York')
    })

    it('sends nothing when the date was cleared', () => {
      const input = build({ date: null, time: '18:30' })

      expect(input.date).toBeNull()
      expect(input.dateTimezone).toBeNull()
    })

    // The caller catches this and shows the DST message above.
    it('throws for a time daylight saving skipped', () => {
      expect(() =>
        build({
          date: '2026-03-08',
          time: '02:30',
          timezone: 'America/New_York',
        })
      ).toThrow(NonexistentLocalTimeError)
    })
  })

  describe('the worst fail', () => {
    // Omitting both fields is what tells the server to leave the stored
    // worst fail alone, which is different from sending null to clear it.
    it('omits both fields entirely when already logged', () => {
      const input = build({ worstFailAlreadyLogged: true, worstFail: '94' })

      expect(input).not.toHaveProperty('worstFail')
      expect(input).not.toHaveProperty('worstFailDate')
    })

    it('sends the fields when not already logged', () => {
      const input = build({ worstFailAlreadyLogged: false, worstFail: '94' })

      expect(input.worstFail).toBe(94)
      expect(input).toHaveProperty('worstFailDate')
    })

    it('uses its own date when entered independently', () => {
      const input = build({
        worstFailSameDay: false,
        worstFailDate: '2026-01-01',
        worstFailTime: '10:00',
        worstFailTimezone: 'UTC',
      })

      expect(input.worstFailDate).toBe('2026-01-01T10:00:00.000Z')
      expect(input.worstFailDateTimezone).toBe('UTC')
    })

    // Nudged a second earlier so the two events do not collide at the
    // minute-level precision the timeline displays.
    it('places a same-day worst fail just before the completion', () => {
      const input = build({
        worstFailSameDay: true,
        date: '2026-03-14',
        time: '18:30',
        timezone: 'UTC',
      })

      expect(input.worstFailDate).toBe('2026-03-14T18:29:59.000Z')
      expect(input.worstFailDateTimezone).toBe('UTC')
    })

    it('copies a same-day bare date across without offsetting', () => {
      const input = build({
        worstFailSameDay: true,
        date: '2026-03-14',
        time: '',
      })

      expect(input.worstFailDate).toBe('2026-03-14')
      expect(input.worstFailDateTimezone).toBeNull()
    })

    it('sends nothing for same-day with no session date at all', () => {
      const input = build({ worstFailSameDay: true, date: null })

      expect(input.worstFailDate).toBeNull()
    })
  })

  describe('the viewer’s defaults', () => {
    it.each([
      ['fps', { fps: '' }, { defaultFps: 240 }, 'fps', 240],
      [
        'percentage version',
        { percentageVersion: null },
        { defaultPercentageVersion: 'TWO_ONE' },
        'percentageVersion',
        'TWO_ONE',
      ],
      [
        'device',
        { device: null },
        { defaultDevice: 'mobile' },
        'device',
        'mobile',
      ],
    ] as const)('fills in the default %s', (_l, d, m, field, expected) => {
      expect(build(d, {}, m)[field]).toBe(expected)
    })

    it.each([
      ['fps', { fps: '60' }, { defaultFps: 240 }, 'fps', 60],
      ['device', { device: 'pc' }, { defaultDevice: 'mobile' }, 'device', 'pc'],
    ] as const)(
      'lets the draft override the default %s',
      (_l, d, m, field, expected) => {
        expect(build(d, {}, m)[field]).toBe(expected)
      }
    )

    // 2.2 is the current basis, so a user with no preference logs on it.
    it('falls back to 2.2 when neither draft nor viewer says', () => {
      expect(build({ percentageVersion: null }).percentageVersion).toBe(
        'TWO_TWO'
      )
    })
  })

  describe('ratings', () => {
    it('sends the simple rating in simple mode', () => {
      const input = build({ simpleRating: 85 }, {}, { ratingMode: 'SIMPLE' })

      expect(input.simpleRating).toBe(85)
      expect(input).not.toHaveProperty('ratingScores')
    })

    it('sends per-category scores in weighted mode', () => {
      const input = build(
        { ratingScores: { gameplay: 80, design: 60 } },
        {},
        { ratingMode: 'WEIGHTED' }
      )

      expect(input.ratingScores).toEqual([
        { categoryId: 'gameplay', score: 80 },
        { categoryId: 'design', score: 60 },
      ])
    })

    // The two modes are exclusive — sending both would let a stale value from
    // the other mode overwrite the stored rating.
    it('nulls the simple rating in weighted mode', () => {
      const input = build(
        { simpleRating: 85, ratingScores: { gameplay: 80 } },
        {},
        { ratingMode: 'WEIGHTED' }
      )

      expect(input.simpleRating).toBeNull()
    })

    it('omits an empty score map rather than sending nothing useful', () => {
      const input = build({ ratingScores: {} }, {}, { ratingMode: 'WEIGHTED' })

      expect(input).not.toHaveProperty('ratingScores')
    })
  })

  // Both are level facts, so a level that has neither must not carry the
  // user's stale draft values.
  describe('the level-gated fields', () => {
    it('sends coins only for a level that has them', () => {
      expect(build({ coinsCollected: 2 }, { coins: 3 }).coinsCollected).toBe(2)
      expect(
        build({ coinsCollected: 2 }, { coins: 0 }).coinsCollected
      ).toBeNull()
      expect(
        build({ coinsCollected: 2 }, { coins: null }).coinsCollected
      ).toBeNull()
    })

    it('sends the two-player fields only for a two-player level', () => {
      const off = build({ twoPlayerSolo: true }, { twoPlayer: false })

      expect(off.twoPlayerSolo).toBeNull()
      expect(off.twoPlayerPartner).toBeNull()
    })

    it('records a solo clear with no partner', () => {
      const input = build(
        { twoPlayerSolo: true, twoPlayerPartner: 'someone' },
        { twoPlayer: true }
      )

      expect(input.twoPlayerSolo).toBe(true)
      expect(input.twoPlayerPartner).toBeNull()
    })

    it('records the partner on a co-op clear', () => {
      const input = build(
        { twoPlayerSolo: false, twoPlayerPartner: '  someone  ' },
        { twoPlayer: true }
      )

      expect(input.twoPlayerSolo).toBe(false)
      expect(input.twoPlayerPartner).toBe('someone')
    })

    it('sends a null partner when the name was left blank', () => {
      const input = build(
        { twoPlayerSolo: false, twoPlayerPartner: '   ' },
        { twoPlayer: true }
      )

      expect(input.twoPlayerPartner).toBeNull()
    })
  })
})

describe('buildProgressInput', () => {
  const build = (
    d: Parameters<typeof draft>[0] = {},
    ...rest: [number?, string?, string?]
  ) =>
    buildProgressInput(
      level(),
      draft(d),
      rest[0],
      rest[1] as never,
      rest[2] as never
    )

  // The two modes are a discriminated union: from_zero carries a single
  // percentage, from_run carries both ends.
  it('sends a from-zero run as a single percentage', () => {
    const input = build({ progressMode: 'from_zero', percentage: '61' })

    expect(input).toMatchObject({ mode: 'from_zero', percentage: 61 })
    expect(input).not.toHaveProperty('runFrom')
  })

  it('sends a mid-level run as both ends', () => {
    const input = build({
      progressMode: 'from_run',
      runFrom: '30',
      runTo: '75',
    })

    expect(input).toMatchObject({ mode: 'from_run', runFrom: 30, runTo: 75 })
    expect(input).not.toHaveProperty('percentage')
  })

  // Zero is a meaningful percentage, and the field is required on the wire —
  // so a blank one becomes 0 rather than null.
  it.each([
    ['from_zero', { progressMode: 'from_zero', percentage: '' }, 'percentage'],
    ['from_run', { progressMode: 'from_run', runFrom: '', runTo: '' }, 'runTo'],
  ] as const)('defaults a blank %s field to zero', (_l, d, field) => {
    expect((build(d) as Record<string, unknown>)[field]).toBe(0)
  })

  it('carries the shared session fields', () => {
    const input = build({
      date: '2026-03-14',
      time: '18:30',
      timezone: 'UTC',
      attempts: '100',
      onStream: true,
      notes: 'gg',
      enjoyment: 70,
    })

    expect(input).toMatchObject({
      date: '2026-03-14T18:30:00.000Z',
      dateTimezone: 'UTC',
      attempts: 100,
      onStream: true,
      notes: 'gg',
      enjoyment: 70,
    })
  })

  it.each([
    ['fps', { fps: '' }, 240, 'fps', 240],
    ['device', { device: null }, undefined, 'device', 'mobile'],
  ] as const)(
    'fills in the caller’s default %s',
    (label, d, fps, field, expected) => {
      const input =
        label === 'fps'
          ? build(d, fps as number)
          : build(d, undefined, undefined, 'mobile')

      expect((input as Record<string, unknown>)[field]).toBe(expected)
    }
  )

  it('falls back to 2.2 with no preference anywhere', () => {
    expect(build({ percentageVersion: null }).percentageVersion).toBe('TWO_TWO')
  })

  // Progress logs no worst fail — that is a level-scoped value the
  // completion and drop paths own.
  it('sends no worst-fail fields at all', () => {
    const input = build({ worstFail: '94' })

    expect(input).not.toHaveProperty('worstFail')
    expect(input).not.toHaveProperty('worstFailDate')
  })
})

describe('buildDropInput', () => {
  const build = (d: Parameters<typeof draft>[0] = {}) =>
    buildDropInput(level(), draft(d))

  it('identifies the level and carries the session fields', () => {
    const input = build({
      date: '2026-03-14',
      time: '18:30',
      timezone: 'UTC',
      attempts: '900',
    })

    expect(input).toMatchObject({
      levelId: '128',
      date: '2026-03-14T18:30:00.000Z',
      dateTimezone: 'UTC',
      attempts: 900,
    })
  })

  // The drop's reason is what lands in the entry's notes field.
  it('sends the drop reason as the notes', () => {
    expect(build({ droppedReason: '  burnout  ' }).notes).toBe('burnout')
  })

  it('sends null notes for a reason left blank', () => {
    expect(build({ droppedReason: '   ' }).notes).toBeNull()
  })

  it('carries the worst fail like a completion does', () => {
    const input = build({
      worstFail: '61',
      worstFailSameDay: true,
      date: '2026-03-14',
      time: '18:30',
      timezone: 'UTC',
    })

    expect(input.worstFail).toBe(61)
    expect(input.worstFailDate).toBe('2026-03-14T18:29:59.000Z')
  })

  it('omits the worst fail entirely when already logged', () => {
    const input = build({ worstFailAlreadyLogged: true, worstFail: '61' })

    expect(input).not.toHaveProperty('worstFail')
    expect(input).not.toHaveProperty('worstFailDate')
  })

  // A drop is not a rating event — none of the completion-only fields belong.
  it.each(['enjoyment', 'simpleRating', 'difficultyOpinion', 'fps'])(
    'sends no %s',
    (field) => {
      expect(
        build({ enjoyment: 70, simpleRating: 85, fps: '240' })
      ).not.toHaveProperty(field)
    }
  )
})
