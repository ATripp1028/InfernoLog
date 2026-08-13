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

const { applyEdit, ProgressFieldsNotApplicableError, LevelNotFoundError } =
  await import('./index')

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
  ratingScore: { deleteMany: vi.fn(), createMany: vi.fn() },
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
