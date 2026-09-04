/**
 * Unit tests for completion write planning.
 *
 * Same overwrite-vs-merge split as the progress/drop planners, and the same
 * risk: a 'merge' that wrote every field would clear values the sheet left
 * blank on every reimport. The other branch worth pinning is the name-only
 * flag — an existing completion with no resolution normally means "no diff to
 * reconcile", but for a name-only row it can also mean "nobody ever got to
 * review this", which must be flagged rather than silently discarded.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportCompletionRow } from '@infernolog/core'

vi.mock('../../../utils/prisma', () => ({ default: {} }))

const { planCompletion, newBatchWrites } = await import('./planWrites')

type PlanCtx = Parameters<typeof planCompletion>[0]

// ─── fixtures ────────────────────────────────────────────────────────────────

const LEVEL = '12345'
const LP_ID = 'lp-existing'
const COMPLETION_ID = 'pu-completion'

/** A planning context for a level, optionally with an existing completion. */
function ctxFor(
  options: { completionId?: string | null; coins?: number | null } = {}
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
          status: 'IN_PROGRESS',
          completionId: options.completionId ?? null,
          visibility: 'PUBLIC',
        },
      ],
    ]),
    levelDiff: new Map([[LEVEL, 'Extreme Demon']]),
    levelCoins: new Map([[LEVEL, options.coins ?? 0]]),
    existingProgress: new Map(),
    existingDrops: new Map(),
    progressEventsByLevel: new Map(),
    dropEventsByLevel: new Map(),
  } as unknown as PlanCtx
}

function row(fields: Record<string, unknown> = {}): ImportCompletionRow {
  return fields as unknown as ImportCompletionRow
}

/**
 * The LevelProgress fields the plan accumulated. A level with an existing row
 * collects them under `update`; a brand-new one under `create`.
 */
function lpFields(ctx: PlanCtx): Record<string, unknown> {
  const plan = ctx.lpPlans.get(LEVEL) as unknown as {
    create?: Record<string, unknown>
    update: Record<string, unknown>
  }
  return plan.create ?? plan.update
}

/** The single queued update, asserted to be the only one. */
function onlyUpdate(ctx: PlanCtx) {
  expect(ctx.writes.progressUpdateUpdates).toHaveLength(1)
  return ctx.writes.progressUpdateUpdates[0]!
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── resolutions ─────────────────────────────────────────────────────────────

describe('planCompletion — review resolutions', () => {
  it.each(['drop', 'duplicate'] as const)('skips a row resolved as %s', (r) => {
    const ctx = ctxFor({ completionId: COMPLETION_ID })

    expect(planCompletion(ctx, LEVEL, row(), r, null, false)).toEqual({
      status: 'skipped',
    })
    expect(ctx.writes.progressUpdateUpdates).toHaveLength(0)
    expect(ctx.writes.newProgressUpdates).toHaveLength(0)
  })

  it('skips an unmodified re-import without flagging it', async () => {
    // No resolution on an id-matched row means /check found no field diff.
    const ctx = ctxFor({ completionId: COMPLETION_ID })

    expect(planCompletion(ctx, LEVEL, row(), undefined, null, false)).toEqual({
      status: 'skipped',
      flagged: false,
    })
  })

  it('flags the same case for a name-only row', () => {
    // /check skips rows with no levelId entirely, so an unresolved name-only
    // row may be a genuine conflict nobody reviewed.
    const ctx = ctxFor({ completionId: COMPLETION_ID })

    expect(planCompletion(ctx, LEVEL, row(), undefined, null, true)).toEqual({
      status: 'skipped',
      flagged: true,
    })
  })
})

// ─── merge ───────────────────────────────────────────────────────────────────

describe('planCompletion — merge writes only what the sheet filled in', () => {
  const merge = (fields: Record<string, unknown>) => {
    const ctx = ctxFor({ completionId: COMPLETION_ID })
    const result = planCompletion(ctx, LEVEL, row(fields), 'merge', null, false)
    return { ctx, result }
  }

  it('carries every mergeable completion field', () => {
    // Each field is its own `if` in the patch builder.
    const { ctx, result } = merge({
      date: '2026-08-12',
      dateUncertain: true,
      attempts: 4021,
      fps: 240,
      onStream: true,
      videoUrl: 'https://youtu.be/abc',
      highlightUrl: 'https://twitch.tv/x',
      notes: 'first win',
      runFrom: 43,
      runTo: 100,
      enjoyment: 8.5,
      difficultyOpinion: 'harder',
      twoPlayerSolo: false,
      twoPlayerPartner: 'friend',
      device: 'pc',
    })

    expect(result).toEqual({ status: 'updated' })
    // difficultyOpinion is level-scoped, so it lands on the LevelProgress
    // half of the plan rather than in the ProgressUpdate patch.
    expect(lpFields(ctx)).toMatchObject({ difficultyOpinion: 'harder' })
    expect(onlyUpdate(ctx).data).toEqual({
      date: new Date('2026-08-12'),
      dateTimezone: null,
      dateUncertain: true,
      attempts: 4021,
      fps: 240,
      onStream: true,
      videoUrl: 'https://youtu.be/abc',
      highlightUrl: 'https://twitch.tv/x',
      notes: 'first win',
      runFrom: 43,
      runTo: 100,
      enjoyment: 85,
      twoPlayerSolo: false,
      twoPlayerPartner: 'friend',
      device: 'pc',
    })
  })

  it('omits the fields the sheet left blank', () => {
    const { ctx } = merge({ attempts: 4021 })

    expect(onlyUpdate(ctx).data).toEqual({ attempts: 4021 })
  })

  it('nulls the timezone alongside a rewritten date', () => {
    const { ctx } = merge({ date: '2026-08-12' })

    expect(onlyUpdate(ctx).data).toMatchObject({ dateTimezone: null })
  })

  it('scales enjoyment up to the stored 0-100 range', () => {
    const { ctx } = merge({ enjoyment: 8.5 })

    expect(onlyUpdate(ctx).data).toEqual({ enjoyment: 85 })
  })

  it('queues no update when the merge row provides nothing', () => {
    const { ctx, result } = merge({})

    expect(result.status).toBe('updated')
    expect(ctx.writes.progressUpdateUpdates).toHaveLength(0)
    expect(lpFields(ctx)).not.toHaveProperty('difficultyOpinion')
  })
})

// ─── GDDL tier and coins ─────────────────────────────────────────────────────

describe('planCompletion — derived fields', () => {
  it('prefers the row’s GDDL tier over the autofilled one, rounded', () => {
    const ctx = ctxFor()
    planCompletion(ctx, LEVEL, row({ userGddlTier: 18.4 }), undefined, 9, false)

    expect(ctx.writes.newProgressUpdates).toHaveLength(1)
    expect(lpFields(ctx)).toMatchObject({ userGddlTier: 18 })
  })

  it('falls back to the autofilled tier when the row has none', () => {
    const ctx = ctxFor()
    planCompletion(ctx, LEVEL, row(), undefined, 9, false)

    expect(lpFields(ctx)).toMatchObject({ userGddlTier: 9 })
  })

  it('ignores the coin columns on a level with no coins', () => {
    // Matches the logging flow — a level without coins can't have them
    // collected, whatever the sheet claims.
    const ctx = ctxFor({ coins: 0 })
    planCompletion(
      ctx,
      LEVEL,
      row({ coinsCollected: 3 }),
      undefined,
      null,
      false
    )

    expect(lpFields(ctx)).toMatchObject({ coinsCollected: null })
  })

  it('keeps the coin count on a level that has coins', () => {
    const ctx = ctxFor({ coins: 3 })
    planCompletion(
      ctx,
      LEVEL,
      row({ coinsCollected: 3 }),
      undefined,
      null,
      false
    )

    expect(lpFields(ctx)).toMatchObject({ coinsCollected: 3 })
  })
})
