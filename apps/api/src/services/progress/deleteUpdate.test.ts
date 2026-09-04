/**
 * Unit tests for deleting one logged entry.
 *
 * Deleting an update means the level's status has to be recomputed from what
 * remains, and the replay is order-dependent: a DROP marks the level dropped,
 * but a later PROGRESS row means the user resumed it. Getting that wrong leaves
 * a level mislabelled in the list with nothing to hint why. The other rule is
 * that undoing a completion also clears the fields that only mean anything for
 * a completed level, and unplaces it from the demon list. Prisma is mocked.
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

const { deleteProgressUpdate } = await import('./index')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

const USER_ID = 'user-1'
const LEVEL_ID = '12345'
const LP_ID = 'lp-1'
const TARGET_ID = 'pu-target'

type Kind = 'PROGRESS' | 'COMPLETION' | 'DROP'

/**
 * The transaction client the delete runs against. `classicDemonList.findMany`,
 * `ratingRanking.findMany` and the activityLog delegates are here because both
 * delete paths emit activity events — the whole-entry path purges the level's
 * history, the uncomplete path emits DEMON_LIST_REMOVED and RATING_REMOVED.
 */
const tx = {
  levelProgress: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  progressUpdate: { findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
  classicDemonList: { deleteMany: vi.fn(), findMany: vi.fn() },
  ratingRanking: { deleteMany: vi.fn(), findMany: vi.fn() },
  activityLog: { create: vi.fn(), deleteMany: vi.fn() },
  activityLogLevelImpact: { createMany: vi.fn() },
}

/**
 * Sets up a level whose stored status is `status`, and whose updates OTHER than
 * the one being deleted are `remaining`, oldest first.
 */
function scenario(
  status: Kind extends never ? never : string,
  remaining: Kind[]
) {
  tx.levelProgress.findUnique.mockResolvedValue({ id: LP_ID, status })
  tx.progressUpdate.findMany.mockResolvedValue(
    remaining.map((kind) => ({ kind }))
  )
}

/** The status written back, or null when no update was issued. */
function writtenStatus(): string | null {
  const call = tx.levelProgress.update.mock.lastCall
  return call
    ? ((call[0] as { data: { status?: string } }).data.status ?? null)
    : null
}

function run() {
  return deleteProgressUpdate(USER_ID, LEVEL_ID, TARGET_ID)
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of Object.values(tx))
    for (const fn of Object.values(model)) fn.mockReset().mockResolvedValue({})
  tx.progressUpdate.findFirst.mockResolvedValue({ id: TARGET_ID })
  // Ranking snapshots read through classicDemonList.findMany; an empty ranking
  // is enough for every case here except the mover row, which comes from the
  // deleted entry itself.
  tx.classicDemonList.findMany.mockResolvedValue([])
  tx.classicDemonList.deleteMany.mockResolvedValue({ count: 1 })
  // Same for the MANUAL rating ordering, which the uncomplete path unplaces
  // alongside the demon list. Nothing ranked by default; the cases that care
  // override it.
  tx.ratingRanking.findMany.mockResolvedValue([])
  tx.ratingRanking.deleteMany.mockResolvedValue({ count: 0 })
  tx.activityLog.create.mockResolvedValue({ id: 'event-1' })
  scenario('IN_PROGRESS', ['PROGRESS'])

  prisma.$transaction.mockReset().mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fn: (client: unknown) => unknown) => fn(tx)) as any
  )
})

// ─── targeting ───────────────────────────────────────────────────────────────

describe('deleteProgressUpdate — targeting', () => {
  it('returns null when the user has no progress on the level', async () => {
    tx.levelProgress.findUnique.mockResolvedValue(null)

    await expect(run()).resolves.toBeNull()
    expect(tx.progressUpdate.delete).not.toHaveBeenCalled()
  })

  it('returns null when the update is not on this level', async () => {
    // Scoped by levelProgressId, so another level's update id can't be deleted.
    tx.progressUpdate.findFirst.mockResolvedValue(null)

    await expect(run()).resolves.toBeNull()
    expect(tx.progressUpdate.delete).not.toHaveBeenCalled()
  })
})

// ─── the last update ─────────────────────────────────────────────────────────

describe('deleteProgressUpdate — deleting the only update', () => {
  it('deletes the whole LevelProgress instead of orphaning it', async () => {
    // A LevelProgress is always created with at least one update, so leaving
    // one with none would break that invariant.
    scenario('IN_PROGRESS', [])

    await expect(run()).resolves.toEqual({ deletedLevelProgress: true })
    expect(tx.levelProgress.delete).toHaveBeenCalledWith({
      where: { id: LP_ID },
    })
    expect(tx.progressUpdate.delete).not.toHaveBeenCalled()
  })

  it('purges the level’s activity history along with the entry', async () => {
    // The entry is gone at the user's request, so its event history goes with
    // it. activity_log hangs off the user and the level, not the entry, so no
    // cascade does this — only the explicit purge.
    scenario('IN_PROGRESS', [])

    await run()

    expect(tx.activityLog.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, levelId: LEVEL_ID },
    })
  })
})

// ─── status replay ───────────────────────────────────────────────────────────

describe('deleteProgressUpdate — recomputing status', () => {
  // `from` must differ from the expected result, or no update is issued at all
  // and the assertion would pass against a broken replay.
  it.each([
    ['a lone progress row', 'COMPLETED', ['PROGRESS'] as Kind[], 'IN_PROGRESS'],
    ['a lone drop', 'COMPLETED', ['DROP'] as Kind[], 'DROPPED'],
    ['a lone completion', 'IN_PROGRESS', ['COMPLETION'] as Kind[], 'COMPLETED'],
  ])('replays %s to %s', async (_label, from, remaining, expected) => {
    scenario(from, remaining)

    await run()

    expect(writtenStatus()).toBe(expected)
  })

  it('treats progress logged after a drop as a resume', async () => {
    // The replay is ordered: a later PROGRESS row means the user came back.
    scenario('COMPLETED', ['DROP', 'PROGRESS'])

    await run()

    expect(writtenStatus()).toBe('IN_PROGRESS')
  })

  it('keeps a drop that came after the progress', async () => {
    scenario('COMPLETED', ['PROGRESS', 'DROP'])

    await run()

    expect(writtenStatus()).toBe('DROPPED')
  })

  it('lets a completion win over an earlier drop', async () => {
    scenario('IN_PROGRESS', ['DROP', 'COMPLETION'])

    await run()

    expect(writtenStatus()).toBe('COMPLETED')
  })

  it('does not let progress logged after a completion un-complete it', async () => {
    // Only DROP moves a completed level; historical progress rows must not.
    scenario('IN_PROGRESS', ['COMPLETION', 'PROGRESS'])

    await run()

    expect(writtenStatus()).toBe('COMPLETED')
  })

  it('writes nothing when the status is unchanged', async () => {
    scenario('IN_PROGRESS', ['PROGRESS'])

    await run()

    expect(tx.levelProgress.update).not.toHaveBeenCalled()
  })

  it('deletes the target update and reports the LevelProgress survived', async () => {
    await expect(run()).resolves.toEqual({ deletedLevelProgress: false })
    expect(tx.progressUpdate.delete).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
    })
  })
})

// ─── undoing a completion ────────────────────────────────────────────────────

describe('deleteProgressUpdate — undoing a completion', () => {
  it('clears the completion-only fields and unplaces the demon list', async () => {
    // coinsCollected/completionTime only mean anything once completed, and a
    // demon list entry for an uncompleted level is not a valid state.
    scenario('COMPLETED', ['PROGRESS'])

    await run()

    const [args] = tx.levelProgress.update.mock.lastCall as unknown as [
      { data: Record<string, unknown> },
    ]
    expect(args.data).toMatchObject({
      status: 'IN_PROGRESS',
      coinsCollected: null,
      completionTime: null,
    })
    expect(tx.classicDemonList.deleteMany).toHaveBeenCalledWith({
      where: { levelProgressId: LP_ID },
    })
  })

  it('emits DEMON_LIST_REMOVED when the uncomplete drops it out of the demon list', async () => {
    // Reaching an unranking indirectly is still an unranking — a listIndex
    // that disappears without an event is a permanent hole in that level's
    // history.
    scenario('COMPLETED', ['PROGRESS'])
    // The mover has to be in the "before" snapshot for an impact row to exist.
    tx.classicDemonList.findMany.mockResolvedValueOnce([
      {
        levelProgressId: LP_ID,
        listIndex: { toNumber: () => 3 },
        levelProgress: { levelId: LEVEL_ID, level: { name: 'Tartarus' } },
      },
    ])

    await run()

    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'DEMON_LIST_REMOVED',
          levelId: LEVEL_ID,
        }),
      })
    )
  })

  it('emits RATING_REMOVED when the uncomplete drops it out of the ranking', async () => {
    // The MANUAL rating ordering follows the demon list's rule for the same
    // reason: only completions can be ranked, and a ratingIndex that vanishes
    // without an event is a hole nothing can fill in afterwards.
    scenario('COMPLETED', ['PROGRESS'])
    tx.ratingRanking.deleteMany.mockResolvedValue({ count: 1 })
    tx.ratingRanking.findMany.mockResolvedValueOnce([
      {
        levelProgressId: LP_ID,
        ratingIndex: { toNumber: () => 3 },
        levelProgress: { levelId: LEVEL_ID, level: { name: 'Tartarus' } },
      },
    ])

    await run()

    expect(tx.ratingRanking.deleteMany).toHaveBeenCalledWith({
      where: { levelProgressId: LP_ID },
    })
    expect(tx.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'RATING_REMOVED',
          levelId: LEVEL_ID,
        }),
      })
    )
  })

  it('leaves both orderings alone when the level is still completed', async () => {
    scenario('COMPLETED', ['COMPLETION'])

    await run()

    expect(tx.classicDemonList.deleteMany).not.toHaveBeenCalled()
    expect(tx.ratingRanking.deleteMany).not.toHaveBeenCalled()
  })

  it('does not clear those fields for a status change that is not an uncomplete', async () => {
    scenario('IN_PROGRESS', ['DROP'])

    await run()

    const [args] = tx.levelProgress.update.mock.lastCall as unknown as [
      { data: Record<string, unknown> },
    ]
    expect(args.data).toEqual({ status: 'DROPPED' })
    expect(tx.classicDemonList.deleteMany).not.toHaveBeenCalled()
    expect(tx.ratingRanking.deleteMany).not.toHaveBeenCalled()
  })
})
