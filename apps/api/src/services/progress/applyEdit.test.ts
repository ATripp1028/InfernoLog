/**
 * Unit tests for editing a logged entry.
 *
 * applyEdit is a large sparse-update builder: every field is optional, and the
 * distinction between "absent" (leave alone) and "explicitly null" (clear) runs
 * through all of it. The rules with teeth are the paired ones — a date always
 * rewrites its timezone so a stale zone can't linger, and percentage and
 * runFrom/runTo are mutually exclusive so writing one clears the other. Prisma
 * is mocked; the integration suite covers the persisted result.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const {
  applyEdit,
  ProgressFieldsNotApplicableError,
  LevelNotFoundError,
  RatingCategoryNotOwnedError,
} = await import('./index')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = 'user-1'
const LEVEL_ID = '12345'
const LP_ID = 'lp-1'
const PU_ID = 'pu-1'

/** The transaction client applyEdit runs against. */
const tx = {
  levelProgress: {
    findUnique: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  progressUpdate: {
    findFirst: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  ratingScore: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  ratingCategory: { count: vi.fn() },
  // Every save emits at most one LOG_EDIT event, so the delegate has to exist
  // even for the cases that change nothing in scope.
  activityLog: { create: vi.fn() },
}

/** The LOG_EDIT field-change rows emitted, or null when no event was written. */
function editedFields(): Array<Record<string, unknown>> | null {
  const call = tx.activityLog.create.mock.lastCall
  if (!call) return null
  const { data } = call[0] as {
    data: { fieldChanges: { create: Array<Record<string, unknown>> } }
  }
  return data.fieldChanges.create
}

/** Points the edit at an update of the given kind. */
function targetKind(kind: 'PROGRESS' | 'COMPLETION' | 'DROP') {
  tx.progressUpdate.findFirst.mockResolvedValue({ id: PU_ID, kind })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function edit(input: any) {
  return applyEdit(USER_ID, LEVEL_ID, input)
}

/** The `data` of the LevelProgress update, or null if none was issued. */
function lpData(): Record<string, unknown> | null {
  const call = tx.levelProgress.update.mock.lastCall
  return call ? (call[0] as { data: Record<string, unknown> }).data : null
}

/** The `data` of the ProgressUpdate update, or null if none was issued. */
function puData(): Record<string, unknown> | null {
  const call = tx.progressUpdate.update.mock.lastCall
  return call ? (call[0] as { data: Record<string, unknown> }).data : null
}

beforeEach(() => {
  vi.clearAllMocks()
  tx.levelProgress.findUnique.mockReset().mockResolvedValue({ id: LP_ID })
  tx.levelProgress.update.mockReset().mockResolvedValue({})
  tx.levelProgress.findUniqueOrThrow
    .mockReset()
    .mockResolvedValue({ id: LP_ID })
  tx.progressUpdate.findFirst.mockReset()
  targetKind('PROGRESS')
  tx.progressUpdate.update.mockReset().mockResolvedValue({})
  tx.progressUpdate.findUniqueOrThrow
    .mockReset()
    .mockResolvedValue({ id: PU_ID, percentage: null })
  tx.ratingScore.deleteMany.mockReset().mockResolvedValue({ count: 0 })
  tx.ratingScore.createMany.mockReset().mockResolvedValue({ count: 0 })
  tx.ratingScore.findMany.mockReset().mockResolvedValue([])
  tx.activityLog.create.mockReset().mockResolvedValue({ id: 'event-1' })
  // Default: every category named in a payload is one of this user's own.
  // ownsCategories() below flips this to model a cross-account id.
  tx.ratingCategory.count
    .mockReset()
    .mockImplementation(
      ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length
    )

  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )
})

// ─── targeting ───────────────────────────────────────────────────────────────

describe('applyEdit — choosing the entry', () => {
  it('returns null when the user has no progress on the level', async () => {
    tx.levelProgress.findUnique.mockResolvedValue(null)

    await expect(edit({ notes: 'x' })).resolves.toBeNull()
    expect(tx.progressUpdate.update).not.toHaveBeenCalled()
  })

  it('edits the named update when an id is given', async () => {
    await edit({ progressUpdateId: 'pu-explicit', notes: 'x' })

    expect(tx.progressUpdate.findFirst).toHaveBeenCalledWith({
      where: { id: 'pu-explicit', levelProgressId: LP_ID },
      select: { id: true, kind: true },
    })
  })

  it('returns null when the named update is not on this level', async () => {
    // Scoped by levelProgressId, so another level's update id cannot be edited.
    tx.progressUpdate.findFirst.mockResolvedValue(null)

    await expect(
      edit({ progressUpdateId: 'pu-elsewhere', notes: 'x' })
    ).resolves.toBeNull()
    expect(tx.progressUpdate.update).not.toHaveBeenCalled()
  })

  it('falls back to the most recent update when no id is given', async () => {
    await edit({ notes: 'x' })

    expect(tx.progressUpdate.findFirst).toHaveBeenCalledWith({
      where: { levelProgressId: LP_ID },
      orderBy: [{ kind: 'desc' }, { loggedAt: 'desc' }],
      select: { id: true, kind: true },
    })
  })

  it('returns null when there is no update to edit', async () => {
    tx.progressUpdate.findFirst.mockResolvedValue(null)

    await expect(edit({ notes: 'x' })).resolves.toBeNull()
  })
})

// ─── the PROGRESS-only fields ────────────────────────────────────────────────

describe('applyEdit — percentage fields are PROGRESS-only', () => {
  it.each(['COMPLETION', 'DROP'] as const)(
    'rejects a percentage edit on a %s entry',
    async (kind) => {
      // Completions are implied 100% and drops track no percentage; the client
      // gates this, but the endpoint is public so the service enforces it.
      targetKind(kind)

      await expect(edit({ percentage: 50 })).rejects.toBeInstanceOf(
        ProgressFieldsNotApplicableError
      )
      expect(tx.progressUpdate.update).not.toHaveBeenCalled()
    }
  )

  it.each(['runFrom', 'runTo'])(
    'rejects a %s edit on a non-PROGRESS entry',
    async (field) => {
      targetKind('COMPLETION')

      await expect(edit({ [field]: 10 })).rejects.toBeInstanceOf(
        ProgressFieldsNotApplicableError
      )
    }
  )

  it('names the offending kind in the error', async () => {
    targetKind('DROP')

    await expect(edit({ percentage: 50 })).rejects.toThrow(/DROP/)
  })

  it('allows other fields on a completion', async () => {
    targetKind('COMPLETION')

    await edit({ notes: 'great run' })

    expect(puData()).toEqual({ notes: 'great run' })
  })
})

// ─── sparse updates ──────────────────────────────────────────────────────────

describe('applyEdit — sparse field handling', () => {
  it('issues no write at all for an empty edit', async () => {
    await edit({})

    expect(tx.levelProgress.update).not.toHaveBeenCalled()
    expect(tx.progressUpdate.update).not.toHaveBeenCalled()
  })

  it('writes only the LevelProgress when only its fields changed', async () => {
    await edit({ levelNotes: 'grinding' })

    expect(lpData()).toEqual({ levelNotes: 'grinding' })
    expect(tx.progressUpdate.update).not.toHaveBeenCalled()
  })

  it('writes only the ProgressUpdate when only its fields changed', async () => {
    await edit({ attempts: 500 })

    expect(puData()).toEqual({ attempts: 500 })
    expect(tx.levelProgress.update).not.toHaveBeenCalled()
  })

  it('routes each field to the right row', async () => {
    await edit({ levelNotes: 'a', worstFail: 97, attempts: 500, fps: 240 })

    expect(lpData()).toEqual({ levelNotes: 'a', worstFail: 97 })
    expect(puData()).toEqual({ attempts: 500, fps: 240 })
  })

  it('applies an explicit null as a clear, not as absent', async () => {
    await edit({ notes: null, levelNotes: null })

    expect(puData()).toEqual({ notes: null })
    expect(lpData()).toEqual({ levelNotes: null })
  })

  it.each([
    'visibility',
    'userGddlTier',
    'simpleRating',
    'coinsCollected',
    'completionTime',
  ])('carries %s onto the LevelProgress', async (field) => {
    await edit({ [field]: 1 })

    expect(lpData()).toHaveProperty(field)
  })

  it.each([
    'dateUncertain',
    'percentageVersion',
    'onStream',
    'difficultyOpinion',
    'enjoyment',
    'videoUrl',
    'highlightUrl',
    'twoPlayerSolo',
    'twoPlayerPartner',
    'device',
  ])('carries %s onto the ProgressUpdate', async (field) => {
    await edit({ [field]: 1 })

    expect(puData()).toHaveProperty(field)
  })
})

// ─── date and timezone are written together ──────────────────────────────────

describe('applyEdit — dates carry their timezone', () => {
  it('nulls dateTimezone when a date arrives without one', async () => {
    // A stale zone left paired with a new date would render the wrong day.
    await edit({ date: new Date('2026-08-12T00:00:00Z') })

    expect(puData()).toEqual({
      date: new Date('2026-08-12T00:00:00Z'),
      dateTimezone: null,
    })
  })

  it('writes the supplied dateTimezone alongside the date', async () => {
    await edit({
      date: new Date('2026-08-12T00:00:00Z'),
      dateTimezone: 'America/New_York',
    })

    expect(puData()).toMatchObject({ dateTimezone: 'America/New_York' })
  })

  it('never writes dateTimezone on its own', async () => {
    await edit({ dateTimezone: 'America/New_York' })

    expect(tx.progressUpdate.update).not.toHaveBeenCalled()
  })

  it('applies the same pairing to worstFailDate', async () => {
    await edit({ worstFailDate: new Date('2026-08-12T00:00:00Z') })

    expect(lpData()).toEqual({
      worstFailDate: new Date('2026-08-12T00:00:00Z'),
      worstFailDateTimezone: null,
    })
  })

  it('never writes worstFailDateTimezone on its own', async () => {
    await edit({ worstFailDateTimezone: 'America/New_York' })

    expect(tx.levelProgress.update).not.toHaveBeenCalled()
  })
})

// ─── percentage vs run range ─────────────────────────────────────────────────

describe('applyEdit — percentage and run range are exclusive', () => {
  it('clears the run range when a percentage is written', async () => {
    // A run either starts from 0% or from a prior run, never both.
    await edit({ percentage: 50 })

    expect(puData()).toEqual({ percentage: 50, runFrom: null, runTo: null })
  })

  it('clears the percentage when a run range is written', async () => {
    await edit({ runFrom: 43, runTo: 100 })

    expect(puData()).toEqual({ runFrom: 43, runTo: 100, percentage: null })
  })

  it('defaults a missing runFrom to 0 rather than clearing it', async () => {
    await edit({ runTo: 90 })

    expect(puData()).toMatchObject({ runFrom: 0, runTo: 90 })
  })

  it('defaults a missing runTo to 100', async () => {
    await edit({ runFrom: 43 })

    expect(puData()).toMatchObject({ runFrom: 43, runTo: 100 })
  })

  it('lets percentage win when both are somehow sent', async () => {
    await edit({ percentage: 50, runFrom: 43, runTo: 100 })

    expect(puData()).toEqual({ percentage: 50, runFrom: null, runTo: null })
  })
})

// ─── rating scores ───────────────────────────────────────────────────────────

describe('applyEdit — rating scores', () => {
  it('replaces the whole set rather than merging into it', async () => {
    await edit({
      ratingScores: [
        { categoryId: 'cat-1', score: 80 },
        { categoryId: 'cat-2', score: 60 },
      ],
    })

    expect(tx.ratingScore.deleteMany).toHaveBeenCalledWith({
      where: { levelProgressId: LP_ID },
    })
    expect(tx.ratingScore.createMany).toHaveBeenCalledWith({
      data: [
        { levelProgressId: LP_ID, categoryId: 'cat-1', score: 80 },
        { levelProgressId: LP_ID, categoryId: 'cat-2', score: 60 },
      ],
    })
  })

  it('clears the scores when given an empty array', async () => {
    await edit({ ratingScores: [] })

    expect(tx.ratingScore.deleteMany).toHaveBeenCalled()
    expect(tx.ratingScore.createMany).not.toHaveBeenCalled()
  })

  it('leaves the scores alone when the field is absent', async () => {
    await edit({ notes: 'x' })

    expect(tx.ratingScore.deleteMany).not.toHaveBeenCalled()
  })

  it('scopes the ownership check to the caller', async () => {
    await edit({ ratingScores: [{ categoryId: 'cat-1', score: 80 }] })

    expect(tx.ratingCategory.count).toHaveBeenCalledWith({
      where: { userId: USER_ID, id: { in: ['cat-1'] } },
    })
  })

  it('rejects a category id belonging to another account', async () => {
    // RatingScore.categoryId is a bare FK with no user column, so the database
    // would accept a stranger's category here — the scope has to come from us.
    tx.ratingCategory.count.mockResolvedValue(0)

    await expect(
      edit({ ratingScores: [{ categoryId: 'someone-elses-cat', score: 80 }] })
    ).rejects.toThrow(RatingCategoryNotOwnedError)
  })

  it("rejects the whole write when only SOME ids are the caller's", async () => {
    // Partial application would silently drop the foreign score and leave a
    // half-written rating; a clear 400 is better.
    tx.ratingCategory.count.mockResolvedValue(1)

    await expect(
      edit({
        ratingScores: [
          { categoryId: 'cat-1', score: 80 },
          { categoryId: 'someone-elses-cat', score: 60 },
        ],
      })
    ).rejects.toThrow(RatingCategoryNotOwnedError)
    expect(tx.ratingScore.createMany).not.toHaveBeenCalled()
  })
})

// ─── result ──────────────────────────────────────────────────────────────────

describe('applyEdit — result', () => {
  it('returns the reloaded entry for the edited update', async () => {
    tx.levelProgress.findUniqueOrThrow.mockResolvedValue({ id: LP_ID })
    tx.progressUpdate.findUniqueOrThrow.mockResolvedValue({
      id: PU_ID,
      percentage: { toNumber: () => 50 },
    })

    const result = await edit({ notes: 'x' })

    expect(result).toMatchObject({
      levelProgress: { id: LP_ID },
      progressUpdate: { id: PU_ID, percentage: 50 },
    })
  })

  it('runs the whole edit in one transaction', async () => {
    await edit({ levelNotes: 'a', attempts: 1, ratingScores: [] })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

// ─── error types ─────────────────────────────────────────────────────────────

describe('progress service error types', () => {
  it('LevelNotFoundError names the level and tells the caller what to do', async () => {
    const err = new LevelNotFoundError('12345')

    expect(err.name).toBe('LevelNotFoundError')
    expect(err.message).toContain('12345')
    expect(err.message).toContain('Resolve it')
  })

  it('ProgressFieldsNotApplicableError names the kind it rejected', async () => {
    const err = new ProgressFieldsNotApplicableError('COMPLETION')

    expect(err.name).toBe('ProgressFieldsNotApplicableError')
    expect(err.message).toContain('COMPLETION')
  })
})

// ─── the edit event ──────────────────────────────────────────────────────────

describe('applyEdit — the LOG_EDIT event', () => {
  it('writes one event for the whole save, however many fields moved', async () => {
    tx.progressUpdate.findUniqueOrThrow.mockResolvedValue({
      id: PU_ID,
      percentage: null,
      attempts: 100,
      notes: null,
    })

    await edit({ attempts: 250, notes: 'finally' })

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1)
    expect(editedFields()).toEqual([
      {
        fieldName: 'attempts',
        category: 'SESSION_DETAIL',
        oldValue: '100',
        newValue: '250',
      },
      {
        fieldName: 'notes',
        category: 'SESSION_DETAIL',
        oldValue: null,
        newValue: 'finally',
      },
    ])
  })

  it('scopes the event to the level being edited', async () => {
    await edit({ notes: 'x' })

    const [args] = tx.activityLog.create.mock.lastCall as unknown as [
      { data: Record<string, unknown> },
    ]
    expect(args.data).toMatchObject({
      userId: USER_ID,
      levelId: LEVEL_ID,
      eventType: 'LOG_EDIT',
    })
  })

  it('writes no event when the save only touched out-of-scope fields', async () => {
    // Privacy and media are edited on the same form and are deliberately not
    // part of the story a feed tells.
    await edit({ visibility: 'PRIVATE', videoUrl: 'https://youtu.be/abc' })

    expect(editedFields()).toBeNull()
  })

  it('writes no event when every value re-sent was already stored', async () => {
    tx.progressUpdate.findUniqueOrThrow.mockResolvedValue({
      id: PU_ID,
      percentage: null,
      notes: 'same',
    })

    await edit({ notes: 'same' })

    expect(editedFields()).toBeNull()
  })
})
