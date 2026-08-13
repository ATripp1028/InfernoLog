/**
 * Unit tests for progress/drop write planning.
 *
 * The integration suite already exercises the derived-key fallback end to end;
 * what it never reaches is the id round-trip branch — the overwrite/merge paths
 * a row takes when it carries a progress_id/drop_id, which is exactly the path
 * a re-imported export takes. The distinction those branches turn on is that
 * `overwrite` writes every field including nulls (a blank cell clears a value)
 * while `merge` writes only the cells the sheet filled in. Getting that
 * backwards silently destroys data on reimport, so it is pinned here.
 *
 * Prisma is mocked but the real planWrites helpers are used — the plan
 * structures are pure in-memory bookkeeping and mocking them would test nothing.
 */

import { describe, expect, it, vi } from 'vitest'
import type { ImportDroppedRow, ImportProgressRow } from '@infernolog/core'

vi.mock('../../../utils/prisma', () => ({ default: {} }))

const {
  deriveEventKey,
  groupByLevel,
  createFieldPusher,
  diffProgressFields,
  diffDroppedFields,
  planDrop,
  planProgress,
  isoDate,
} = await import('./planEvents')
const { newBatchWrites } = await import('./planWrites')

type PlanCtx = Parameters<typeof planDrop>[0]
type ExistingEvent = Parameters<typeof diffProgressFields>[0]

// ─── fixtures ────────────────────────────────────────────────────────────────

const LEVEL = '12345'
const LP_ID = 'lp-existing'
const PU_ID = 'pu-existing'

/** A stored progress/drop row, with only the fields a test cares about set. */
function existingEvent(overrides: Partial<ExistingEvent> = {}): ExistingEvent {
  return {
    id: PU_ID,
    levelId: LEVEL,
    date: null,
    dateTimezone: null,
    dateUncertain: false,
    attempts: null,
    percentage: null,
    runFrom: null,
    runTo: null,
    fps: null,
    onStream: false,
    highlightUrl: null,
    notes: null,
    enjoyment: null,
    device: null,
    ...overrides,
  }
}

/**
 * A planning context for one level that already has a LevelProgress row.
 * `status` seeds the level's stored state so the completed-level guard is
 * reachable.
 */
function ctxFor(
  options: {
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'DROPPED'
    existingDrops?: [string, { id: string; levelId: string }][]
    existingProgress?: [string, { id: string; levelId: string }][]
    dropEvents?: ExistingEvent[]
    progressEvents?: ExistingEvent[]
  } = {}
): PlanCtx {
  return {
    userId: 'user-1',
    writes: newBatchWrites(),
    lpPlans: new Map(),
    dbState: new Map([
      [
        LEVEL,
        {
          id: LP_ID,
          status: options.status ?? 'IN_PROGRESS',
          completionId: null,
          visibility: 'PUBLIC',
        },
      ],
    ]),
    levelDiff: new Map([[LEVEL, 'Extreme Demon']]),
    levelCoins: new Map(),
    existingProgress: new Map(options.existingProgress ?? []),
    existingDrops: new Map(options.existingDrops ?? []),
    progressEventsByLevel: new Map(
      options.progressEvents ? [[LEVEL, options.progressEvents]] : []
    ),
    dropEventsByLevel: new Map(
      options.dropEvents ? [[LEVEL, options.dropEvents]] : []
    ),
  } as unknown as PlanCtx
}

/** The single queued update, asserted to be the only one. */
function onlyUpdate(ctx: PlanCtx) {
  expect(ctx.writes.progressUpdateUpdates).toHaveLength(1)
  return ctx.writes.progressUpdateUpdates[0]!
}

// ─── deriveEventKey ──────────────────────────────────────────────────────────

describe('deriveEventKey', () => {
  it('returns null when the row carries no distinguishing session data', () => {
    // Otherwise a batch of blank rows would all dedupe against each other.
    expect(
      deriveEventKey({
        date: null,
        percentage: null,
        runFrom: null,
        runTo: null,
      })
    ).toBeNull()
  })

  it('builds a key from any single populated field', () => {
    expect(
      deriveEventKey({
        date: '2026-08-12',
        percentage: null,
        runFrom: null,
        runTo: null,
      })
    ).toBe('2026-08-12|||')
  })

  it('distinguishes a run range from a flat reading on the same day', () => {
    // A 43-100 run and a flat 35% on one day are different events.
    const run = deriveEventKey({
      date: '2026-08-12',
      percentage: null,
      runFrom: 43,
      runTo: 100,
    })
    const flat = deriveEventKey({
      date: '2026-08-12',
      percentage: 35,
      runFrom: null,
      runTo: null,
    })
    expect(run).not.toBe(flat)
  })

  it('treats a zero as a value, not an absence', () => {
    expect(
      deriveEventKey({ date: null, percentage: 0, runFrom: null, runTo: null })
    ).not.toBeNull()
  })

  it('gives equal field sets equal keys', () => {
    const fields = {
      date: '2026-08-12',
      percentage: 35,
      runFrom: 1,
      runTo: 35,
    }
    expect(deriveEventKey(fields)).toBe(deriveEventKey({ ...fields }))
  })
})

// ─── groupByLevel ────────────────────────────────────────────────────────────

describe('groupByLevel', () => {
  it('buckets several events under one level, preserving order', () => {
    const a = existingEvent({ id: 'a' })
    const b = existingEvent({ id: 'b' })
    const grouped = groupByLevel([a, b])

    expect(grouped.get(LEVEL)).toEqual([a, b])
  })

  it('keeps separate levels separate', () => {
    const a = existingEvent({ id: 'a' })
    const b = existingEvent({ id: 'b', levelId: '999' })
    const grouped = groupByLevel([a, b])

    expect(grouped.get(LEVEL)).toEqual([a])
    expect(grouped.get('999')).toEqual([b])
  })

  it('returns an empty map for no events', () => {
    expect(groupByLevel([]).size).toBe(0)
  })
})

// ─── createFieldPusher / diffs ───────────────────────────────────────────────

describe('createFieldPusher', () => {
  it('skips a blank sheet cell — null means "leave as is", not "clear"', () => {
    const diffs: Parameters<typeof createFieldPusher>[0] = []
    createFieldPusher(diffs)('attempts', 500, null)
    expect(diffs).toEqual([])
  })

  it('skips an unchanged value', () => {
    const diffs: Parameters<typeof createFieldPusher>[0] = []
    createFieldPusher(diffs)('attempts', 500, 500)
    expect(diffs).toEqual([])
  })

  it('records a genuine change, including over a null existing value', () => {
    const diffs: Parameters<typeof createFieldPusher>[0] = []
    const push = createFieldPusher(diffs)
    push('attempts', 500, 600)
    push('notes', null, 'first run')

    expect(diffs).toEqual([
      { field: 'attempts', existingValue: 500, importedValue: 600 },
      { field: 'notes', existingValue: null, importedValue: 'first run' },
    ])
  })
})

describe('diffProgressFields', () => {
  it('reports no diff when the row matches what is stored', () => {
    const existing = existingEvent({ attempts: 500, percentage: 35 })
    const row = { attempts: 500, percentage: 35 } as ImportProgressRow

    expect(diffProgressFields(existing, row)).toEqual([])
  })

  it('compares enjoyment on the display scale, not the stored one', () => {
    // Stored 0-100 internally, sheets carry 0-10 — 85 and 8.5 are the same.
    const existing = existingEvent({ enjoyment: 85 })
    expect(
      diffProgressFields(existing, { enjoyment: 8.5 } as ImportProgressRow)
    ).toEqual([])
    expect(
      diffProgressFields(existing, { enjoyment: 9 } as ImportProgressRow)
    ).toEqual([{ field: 'enjoyment', existingValue: 8.5, importedValue: 9 }])
  })

  it('reads the stored date back through its own timezone', () => {
    // 02:00 UTC was still the 11th where it was logged.
    const existing = existingEvent({
      date: new Date('2026-08-12T02:00:00Z'),
      dateTimezone: 'America/New_York',
    })

    expect(
      diffProgressFields(existing, { date: '2026-08-11' } as ImportProgressRow)
    ).toEqual([])
  })

  it('flags each differing field once', () => {
    const existing = existingEvent({ attempts: 500, notes: 'old' })
    const diffs = diffProgressFields(existing, {
      attempts: 600,
      notes: 'new',
    } as ImportProgressRow)

    expect(diffs.map((d) => d.field)).toEqual(['attempts', 'notes'])
  })
})

describe('diffDroppedFields', () => {
  it('maps the dropped-tab column names onto the stored fields', () => {
    const existing = existingEvent({
      date: new Date('2026-08-12T00:00:00Z'),
      percentage: 35,
      attempts: 500,
      notes: 'too hard',
    })
    const diffs = diffDroppedFields(existing, {
      droppedAt: '2026-08-13',
      bestProgress: 40,
      attemptsAtDrop: 600,
      reason: 'burnt out',
    } as ImportDroppedRow)

    expect(diffs.map((d) => d.field)).toEqual([
      'droppedAt',
      'bestProgress',
      'attemptsAtDrop',
      'reason',
    ])
  })

  it('reports no diff for an unchanged drop', () => {
    const existing = existingEvent({ percentage: 35, notes: 'too hard' })
    expect(
      diffDroppedFields(existing, {
        bestProgress: 35,
        reason: 'too hard',
      } as ImportDroppedRow)
    ).toEqual([])
  })
})

// ─── isoDate ─────────────────────────────────────────────────────────────────

describe('isoDate', () => {
  it('returns null for a null date', () => {
    expect(isoDate(null, null)).toBeNull()
    expect(isoDate(null, 'America/New_York')).toBeNull()
  })

  it('slices UTC when no timezone was recorded', () => {
    expect(isoDate(new Date('2026-08-12T00:00:00Z'), null)).toBe('2026-08-12')
  })

  it('resolves through the recorded zone when there is one', () => {
    expect(isoDate(new Date('2026-08-12T02:00:00Z'), 'America/New_York')).toBe(
      '2026-08-11'
    )
  })
})

// ─── planDrop: conflict-review resolutions ───────────────────────────────────

describe('planDrop — review resolutions', () => {
  it.each([
    ['drop', 'Discarded during conflict review'],
    ['duplicate', 'Duplicate of an existing entry'],
  ] as const)('skips a row resolved as %s', (resolution, reason) => {
    const ctx = ctxFor()
    const result = planDrop(ctx, LEVEL, {} as ImportDroppedRow, resolution)

    expect(result).toEqual({ status: 'skipped', reason })
    expect(ctx.writes.newProgressUpdates).toHaveLength(0)
    expect(ctx.writes.progressUpdateUpdates).toHaveLength(0)
  })
})

// ─── planDrop: id round-trip ─────────────────────────────────────────────────

describe('planDrop — round-trips by dropId', () => {
  const DROP_ID = 'drop-1'
  const withMatch = () =>
    ctxFor({ existingDrops: [[DROP_ID, { id: PU_ID, levelId: LEVEL }]] })

  it('overwrite writes every field, including the blank ones', () => {
    // This is what makes overwrite a real replace: a cleared cell clears the
    // stored value rather than being ignored.
    const ctx = withMatch()
    const result = planDrop(
      ctx,
      LEVEL,
      { dropId: DROP_ID, bestProgress: 40 } as ImportDroppedRow,
      'overwrite'
    )

    expect(result).toEqual({ status: 'updated', reason: 'Overwritten' })
    expect(onlyUpdate(ctx)).toEqual({
      id: PU_ID,
      data: {
        date: null,
        dateTimezone: null,
        attempts: null,
        notes: null,
        percentage: 40,
        runFrom: null,
        runTo: null,
      },
    })
  })

  it('merge writes only the fields the sheet provided', () => {
    const ctx = withMatch()
    const result = planDrop(
      ctx,
      LEVEL,
      { dropId: DROP_ID, bestProgress: 40 } as ImportDroppedRow,
      'merge'
    )

    expect(result).toEqual({ status: 'updated', reason: 'Merged' })
    expect(onlyUpdate(ctx).data).toEqual({ percentage: 40 })
  })

  it('an ordinary id round-trip merges with no reason attached', () => {
    const ctx = withMatch()
    const result = planDrop(
      ctx,
      LEVEL,
      { dropId: DROP_ID, attemptsAtDrop: 600 } as ImportDroppedRow,
      undefined
    )

    expect(result).toEqual({ status: 'updated', reason: undefined })
    expect(onlyUpdate(ctx).data).toEqual({ attempts: 600 })
  })

  it('queues no update when a merge row provides nothing', () => {
    const ctx = withMatch()
    const result = planDrop(
      ctx,
      LEVEL,
      { dropId: DROP_ID } as ImportDroppedRow,
      'merge'
    )

    expect(result.status).toBe('updated')
    expect(ctx.writes.progressUpdateUpdates).toHaveLength(0)
  })

  it('carries every mergeable drop field the sheet provides', () => {
    // Each field is its own `if` in the merge builder, so one field per test
    // would leave most of them unexercised.
    const ctx = withMatch()
    planDrop(
      ctx,
      LEVEL,
      {
        dropId: DROP_ID,
        droppedAt: '2026-08-12',
        attemptsAtDrop: 600,
        reason: 'burnt out',
        bestProgress: 40,
        runFrom: 10,
        runTo: 40,
      } as ImportDroppedRow,
      'merge'
    )

    expect(onlyUpdate(ctx).data).toEqual({
      date: new Date('2026-08-12'),
      dateTimezone: null,
      attempts: 600,
      notes: 'burnt out',
      percentage: 40,
      runFrom: 10,
      runTo: 40,
    })
  })

  it('nulls the timezone alongside a rewritten date', () => {
    // Import rows never carry a time-of-day, so a stale zone must not linger.
    const ctx = withMatch()
    planDrop(
      ctx,
      LEVEL,
      { dropId: DROP_ID, droppedAt: '2026-08-12' } as ImportDroppedRow,
      'merge'
    )

    expect(onlyUpdate(ctx).data).toMatchObject({ dateTimezone: null })
  })

  it('creates a new row when the dropId belongs to another level', () => {
    // A foreign/mismatched id must not update someone else's event.
    const ctx = ctxFor({
      existingDrops: [[DROP_ID, { id: PU_ID, levelId: 'other-level' }]],
    })
    const result = planDrop(
      ctx,
      LEVEL,
      { dropId: DROP_ID, bestProgress: 40 } as ImportDroppedRow,
      undefined
    )

    expect(result.status).toBe('committed')
    expect(ctx.writes.progressUpdateUpdates).toHaveLength(0)
    expect(ctx.writes.newProgressUpdates).toHaveLength(1)
  })
})

// ─── planDrop: level status ──────────────────────────────────────────────────

describe('planDrop — level status', () => {
  it('marks an in-progress level DROPPED', () => {
    const ctx = ctxFor()
    planDrop(ctx, LEVEL, { bestProgress: 40 } as ImportDroppedRow, undefined)

    expect(ctx.lpPlans.get(LEVEL)!.update).toMatchObject({ status: 'DROPPED' })
  })

  it('does not un-complete a completed level', () => {
    const ctx = ctxFor({ status: 'COMPLETED' })
    planDrop(ctx, LEVEL, { bestProgress: 40 } as ImportDroppedRow, undefined)

    expect(ctx.lpPlans.get(LEVEL)!.update).toMatchObject({
      status: 'COMPLETED',
    })
  })
})

// ─── planDrop: derived-key dedup ─────────────────────────────────────────────

describe('planDrop — derived-key dedup', () => {
  // The row carries a `reason`, so a stored row with a different one is a
  // genuine partial. A field the sheet leaves blank can never make a diff.
  const row = {
    droppedAt: '2026-08-12',
    bestProgress: 35,
    reason: 'my notes',
  } as ImportDroppedRow

  const stored = (overrides: Partial<ExistingEvent> = {}) =>
    existingEvent({
      date: new Date('2026-08-12T00:00:00Z'),
      percentage: 35,
      notes: 'my notes',
      ...overrides,
    })

  const exact = (id = 'exact') => stored({ id })
  const partial = (id = 'partial') => stored({ id, notes: 'other notes' })

  it('skips an exact duplicate without writing', () => {
    const ctx = ctxFor({ dropEvents: [exact()] })
    const result = planDrop(ctx, LEVEL, row, undefined)

    expect(result).toEqual({
      status: 'skipped',
      reason: 'Duplicate of an existing entry',
    })
    expect(ctx.writes.newProgressUpdates).toHaveLength(0)
  })

  it('commits a same-key row that differs, flagged for review', () => {
    // Never silently dropped: it may be genuinely new data.
    const ctx = ctxFor({ dropEvents: [partial()] })
    const result = planDrop(ctx, LEVEL, row, undefined)

    expect(result.status).toBe('committed')
    expect(result.flagged).toBe(true)
    expect(result.reason).toContain('Possible duplicate')
    expect(ctx.writes.newProgressUpdates).toHaveLength(1)
  })

  it('prefers an exact match over a same-key partial, whatever the row order', () => {
    // No ORDER BY guarantees which comes back first, so both orders must land
    // on 'exact' rather than mislabelling a true duplicate as partial.
    for (const events of [
      [partial(), exact()],
      [exact(), partial()],
    ]) {
      const ctx = ctxFor({ dropEvents: events })
      expect(planDrop(ctx, LEVEL, row, undefined).status).toBe('skipped')
    }
  })

  it('commits unflagged when nothing shares the key', () => {
    const ctx = ctxFor({ dropEvents: [stored({ percentage: 99 })] })
    const result = planDrop(ctx, LEVEL, row, undefined)

    expect(result).toEqual({ status: 'committed' })
  })

  it('stamps the level difficulty onto the new row', () => {
    const ctx = ctxFor()
    planDrop(ctx, LEVEL, row, undefined)

    expect(ctx.writes.newProgressUpdates[0]).toMatchObject({
      kind: 'DROP',
      levelProgressId: LP_ID,
      inGameDifficulty: 'Extreme Demon',
    })
  })
})

// ─── planProgress: conflict-review resolutions ───────────────────────────────

describe('planProgress — review resolutions', () => {
  it.each([
    ['drop', 'Discarded during conflict review'],
    ['duplicate', 'Duplicate of an existing entry'],
  ] as const)('skips a row resolved as %s', (resolution, reason) => {
    const ctx = ctxFor()
    const result = planProgress(ctx, LEVEL, {} as ImportProgressRow, resolution)

    expect(result).toEqual({ status: 'skipped', reason })
    expect(ctx.writes.newProgressUpdates).toHaveLength(0)
  })
})

// ─── planProgress: id round-trip ─────────────────────────────────────────────

describe('planProgress — round-trips by progressId', () => {
  const PROGRESS_ID = 'progress-1'
  const withMatch = () =>
    ctxFor({ existingProgress: [[PROGRESS_ID, { id: PU_ID, levelId: LEVEL }]] })

  it('overwrite writes the full field set, blanks included', () => {
    const ctx = withMatch()
    const result = planProgress(
      ctx,
      LEVEL,
      { progressId: PROGRESS_ID, percentage: 35 } as ImportProgressRow,
      'overwrite'
    )

    expect(result).toEqual({ status: 'updated', reason: 'Overwritten' })
    expect(onlyUpdate(ctx)).toEqual({
      id: PU_ID,
      data: {
        date: null,
        dateTimezone: null,
        dateUncertain: false,
        attempts: null,
        percentage: 35,
        runFrom: null,
        runTo: null,
        fps: null,
        onStream: false,
        highlightUrl: null,
        notes: null,
        enjoyment: null,
        device: null,
      },
    })
  })

  it('merge writes only the provided fields', () => {
    const ctx = withMatch()
    const result = planProgress(
      ctx,
      LEVEL,
      { progressId: PROGRESS_ID, attempts: 600 } as ImportProgressRow,
      'merge'
    )

    expect(result).toEqual({ status: 'updated', reason: 'Merged' })
    expect(onlyUpdate(ctx).data).toEqual({ attempts: 600 })
  })

  it('an ordinary id round-trip merges with no reason attached', () => {
    const ctx = withMatch()
    const result = planProgress(
      ctx,
      LEVEL,
      { progressId: PROGRESS_ID, notes: 'session 2' } as ImportProgressRow,
      undefined
    )

    expect(result).toEqual({ status: 'updated', reason: undefined })
    expect(onlyUpdate(ctx).data).toEqual({ notes: 'session 2' })
  })

  it('scales enjoyment up to the stored 0-100 range on both paths', () => {
    const merged = withMatch()
    planProgress(
      merged,
      LEVEL,
      { progressId: PROGRESS_ID, enjoyment: 8.5 } as ImportProgressRow,
      'merge'
    )
    expect(onlyUpdate(merged).data).toEqual({ enjoyment: 85 })

    const overwritten = withMatch()
    planProgress(
      overwritten,
      LEVEL,
      { progressId: PROGRESS_ID, enjoyment: 8.5 } as ImportProgressRow,
      'overwrite'
    )
    expect(onlyUpdate(overwritten).data).toMatchObject({ enjoyment: 85 })
  })

  it('carries every mergeable progress field the sheet provides', () => {
    const ctx = withMatch()
    planProgress(
      ctx,
      LEVEL,
      {
        progressId: PROGRESS_ID,
        date: '2026-08-12',
        dateUncertain: true,
        attempts: 600,
        percentage: 40,
        runFrom: 10,
        runTo: 40,
        fps: 240,
        onStream: true,
        highlightUrl: 'https://twitch.tv/x',
        notes: 'session 2',
        enjoyment: 8.5,
        device: 'pc',
      } as ImportProgressRow,
      'merge'
    )

    expect(onlyUpdate(ctx).data).toEqual({
      date: new Date('2026-08-12'),
      dateTimezone: null,
      dateUncertain: true,
      attempts: 600,
      percentage: 40,
      runFrom: 10,
      runTo: 40,
      fps: 240,
      onStream: true,
      highlightUrl: 'https://twitch.tv/x',
      notes: 'session 2',
      enjoyment: 85,
      device: 'pc',
    })
  })

  it('queues no update when a merge row provides nothing', () => {
    const ctx = withMatch()
    const result = planProgress(
      ctx,
      LEVEL,
      { progressId: PROGRESS_ID } as ImportProgressRow,
      'merge'
    )

    expect(result.status).toBe('updated')
    expect(ctx.writes.progressUpdateUpdates).toHaveLength(0)
  })

  it('creates a new row when the progressId belongs to another level', () => {
    const ctx = ctxFor({
      existingProgress: [[PROGRESS_ID, { id: PU_ID, levelId: 'other-level' }]],
    })
    const result = planProgress(
      ctx,
      LEVEL,
      { progressId: PROGRESS_ID, percentage: 35 } as ImportProgressRow,
      undefined
    )

    expect(result.status).toBe('committed')
    expect(ctx.writes.newProgressUpdates).toHaveLength(1)
  })

  it('applies visibility to the level on the round-trip path', () => {
    const ctx = withMatch()
    planProgress(
      ctx,
      LEVEL,
      { progressId: PROGRESS_ID, visibility: 'PRIVATE' } as ImportProgressRow,
      'merge'
    )

    expect(ctx.lpPlans.get(LEVEL)!.update).toMatchObject({
      visibility: 'PRIVATE',
    })
  })
})

// ─── planProgress: status and dedup ──────────────────────────────────────────

describe('planProgress — never establishes level status', () => {
  it.each(['IN_PROGRESS', 'COMPLETED', 'DROPPED'] as const)(
    'leaves a %s level’s status untouched',
    (status) => {
      // Historical progress rows must not flip a dropped level back to active.
      const ctx = ctxFor({ status })
      planProgress(
        ctx,
        LEVEL,
        { percentage: 35 } as ImportProgressRow,
        undefined
      )

      expect(ctx.lpPlans.get(LEVEL)!.update).not.toHaveProperty('status')
    }
  )
})

describe('planProgress — derived-key dedup', () => {
  const row = {
    date: '2026-08-12',
    percentage: 35,
    notes: 'my notes',
  } as ImportProgressRow

  const stored = (overrides: Partial<ExistingEvent> = {}) =>
    existingEvent({
      date: new Date('2026-08-12T00:00:00Z'),
      percentage: 35,
      notes: 'my notes',
      ...overrides,
    })

  it('skips an exact duplicate without writing', () => {
    const ctx = ctxFor({ progressEvents: [stored()] })
    const result = planProgress(ctx, LEVEL, row, undefined)

    expect(result).toEqual({
      status: 'skipped',
      reason: 'Duplicate of an existing entry',
    })
    expect(ctx.writes.newProgressUpdates).toHaveLength(0)
  })

  it('commits a same-key row that differs, flagged for review', () => {
    const ctx = ctxFor({ progressEvents: [stored({ notes: 'other notes' })] })
    const result = planProgress(ctx, LEVEL, row, undefined)

    expect(result.status).toBe('committed')
    expect(result.flagged).toBe(true)
    expect(result.reason).toContain('progress_id')
  })

  it('ignores a stored-only difference the sheet left blank', () => {
    // A blank cell means "leave as is", so it can never make a row a partial.
    const ctx = ctxFor({ progressEvents: [stored({ fps: 240 })] })
    const result = planProgress(ctx, LEVEL, row, undefined)

    expect(result.status).toBe('skipped')
  })

  it('commits a keyless row without deduping it', () => {
    // No date/percentage/run data means nothing to match on, so two blank rows
    // must not collapse into one.
    const ctx = ctxFor({ progressEvents: [stored()] })
    const result = planProgress(ctx, LEVEL, {} as ImportProgressRow, undefined)

    expect(result).toEqual({ status: 'committed' })
    expect(ctx.writes.newProgressUpdates).toHaveLength(1)
  })

  it('writes the new row against the level’s LevelProgress plan', () => {
    const ctx = ctxFor()
    planProgress(ctx, LEVEL, row, undefined)

    expect(ctx.writes.newProgressUpdates[0]).toMatchObject({
      kind: 'PROGRESS',
      levelProgressId: LP_ID,
      percentage: 35,
      inGameDifficulty: 'Extreme Demon',
    })
  })
})
