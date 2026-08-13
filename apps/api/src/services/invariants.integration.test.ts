/**
 * Integration tests for the application-layer invariants.
 *
 * These two rules are enforced in code, not by a database constraint, which
 * means every write path has to uphold them independently and a new path can
 * break them silently. So rather than assert per-path behaviour, each test
 * drives one real write path against a real database and then runs a
 * whole-database sweep (`expectNoDuplicateCompletions` /
 * `expectWantToBeatUnbeaten`) that fails if ANY row violates the rule. Adding a
 * fourth write path without upholding them should turn this file red.
 *
 * Only the external network is mocked; Postgres is real.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import type { ImportCommitRow } from '@infernolog/core'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../test/utils'

vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('@sentry/aws-serverless', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ─── external network only ───────────────────────────────────────────────────

const { mockFetchUserInfo, mockFetchSubmissions, mockFetchTier, mockResolveByName } =
  vi.hoisted(() => ({
    mockFetchUserInfo: vi.fn(),
    mockFetchSubmissions: vi.fn(),
    mockFetchTier: vi.fn(),
    mockResolveByName: vi.fn(),
  }))

vi.mock('../utils/gddl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/gddl')>()),
  fetchGddlUserInfo: mockFetchUserInfo,
  fetchAllGddlSubmissions: mockFetchSubmissions,
  fetchGddlTier: mockFetchTier,
}))
vi.mock('../utils/robtop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/robtop')>()),
  // The levels these tests use are seeded already, so this only ever answers
  // for an id the sync invented; "not_found" keeps it a stub.
  fetchRobtopLevelResult: vi.fn(async () => ({ status: 'not_found' as const })),
}))
vi.mock('./importExport/import/levelResolution', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('./importExport/import/levelResolution')
  >()),
  resolveByName: mockResolveByName,
}))

const { default: loggingApp } = await import('../routes/progress/index')
const { default: collectionsApp } = await import('../routes/collections/index')
const { syncGddlSubmissions } = await import('./gddl/sync')
const { processImportJobBatch } = await import('./importExport/import')

const prisma = getTestPrisma()

// ─── the sweeps ──────────────────────────────────────────────────────────────

/**
 * Fails if ANY level_progress in the database holds more than one
 * kind=COMPLETION row. Run after every write path, not just the one under test.
 */
async function expectNoDuplicateCompletions() {
  const rows = await prisma.$queryRaw<{ levelProgressId: string; n: bigint }[]>`
    SELECT "levelProgressId", COUNT(*) AS n
    FROM "progress_updates"
    WHERE kind = 'COMPLETION'
    GROUP BY "levelProgressId"
    HAVING COUNT(*) > 1
  `
  expect(rows).toEqual([])
}

/**
 * Fails if ANY Want to Beat entry points at a level its owner has completed.
 */
async function expectWantToBeatUnbeaten() {
  const rows = await prisma.$queryRaw<{ levelId: string }[]>`
    SELECT ce."levelId"
    FROM "collection_entries" ce
    JOIN "collections" c ON c.id = ce."collectionId"
    JOIN "level_progress" lp
      ON lp."userId" = c."userId" AND lp."levelId" = ce."levelId"
    WHERE c.type = 'WANT_TO_BEAT'
      AND EXISTS (
        SELECT 1 FROM "progress_updates" pu
        WHERE pu."levelProgressId" = lp.id AND pu.kind = 'COMPLETION'
      )
  `
  expect(rows).toEqual([])
}

// ─── fixtures ────────────────────────────────────────────────────────────────

const LEVEL_ID = '100'

/** A user with a Want to Beat collection, plus one cached level. */
async function seedWorld() {
  const user = await seedUser(prisma)
  await seedLevel(prisma, { inGameId: LEVEL_ID, inGameDifficulty: 'Insane Demon' })
  const wtb = await prisma.collection.create({
    data: { userId: user.id, name: 'Want to Beat', type: 'WANT_TO_BEAT' },
  })
  return { user, wtb }
}

/** Puts a level into the user's Want to Beat collection directly. */
async function addToWantToBeat(collectionId: string, levelId: string) {
  await prisma.collectionEntry.create({
    data: { collectionId, levelId, rankingIndex: 1 },
  })
}

function logCompletion(userId: string, payload: Record<string, unknown> = {}) {
  return buildApp(loggingApp, { userId }).request('/me/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ levelId: LEVEL_ID, dateUncertain: false, ...payload }),
  })
}

/** A GDDL submission for LEVEL_ID. */
function gddlSubmission(overrides: Record<string, unknown> = {}) {
  return {
    ID: 1,
    Rating: 8,
    Enjoyment: 7,
    Proof: null,
    DateAdded: '2026-06-01T00:00:00Z',
    Level: {
      ID: Number(LEVEL_ID),
      Rating: 8,
      Enjoyment: 7,
      Meta: { Name: 'Test Level' },
    },
    ...overrides,
  }
}

/**
 * Runs the import commit path for the given completion rows, persisting the
 * job and its rows first the way POST /me/import/start would.
 */
async function runImport(
  userId: string,
  rows: { rowIndex: number; data: Record<string, unknown> }[]
) {
  const commitRows = rows.map((r) => ({
    type: 'completion' as const,
    rowIndex: r.rowIndex,
    data: r.data,
  }))

  const job = await prisma.importJob.create({
    data: { userId, status: 'running', totalRows: rows.length },
  })
  const created = await Promise.all(
    commitRows.map((row) =>
      prisma.importJobRow.create({
        data: {
          jobId: job.id,
          rowIndex: row.rowIndex,
          rawData: row as unknown as Prisma.InputJsonValue,
          status: 'pending',
        },
      })
    )
  )

  return processImportJobBatch(
    userId,
    job.id,
    created.map((dbRow, i) => ({
      id: dbRow.id,
      rowIndex: commitRows[i]!.rowIndex,
      rawData: commitRows[i]! as unknown as ImportCommitRow,
    }))
  )
}

/** How many COMPLETION rows the user holds for LEVEL_ID. */
async function completionCount(userId: string) {
  return prisma.progressUpdate.count({
    where: {
      kind: 'COMPLETION',
      levelProgress: { userId, levelId: LEVEL_ID },
    },
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
  mockFetchUserInfo.mockResolvedValue({ id: 17251, name: 'Riot' })
  mockFetchSubmissions.mockResolvedValue([])
  mockFetchTier.mockResolvedValue(null)
  mockResolveByName.mockResolvedValue(null)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── the sweeps themselves ───────────────────────────────────────────────────

describe('the invariant sweeps', () => {
  // A sweep that cannot fail is worse than no sweep — it reads as protection
  // while asserting nothing. These plant a violation directly through Prisma,
  // bypassing every service, and check the sweep notices.

  it('expectNoDuplicateCompletions catches a planted second completion', async () => {
    const { user } = await seedWorld()
    await logCompletion(user.id, { attempts: 100 })
    const lp = await prisma.levelProgress.findFirstOrThrow({
      where: { userId: user.id, levelId: LEVEL_ID },
    })

    await prisma.progressUpdate.create({
      data: { levelProgressId: lp.id, kind: 'COMPLETION' },
    })

    await expect(expectNoDuplicateCompletions()).rejects.toThrow()
  })

  it('expectWantToBeatUnbeaten catches a planted completed entry', async () => {
    const { user, wtb } = await seedWorld()
    await logCompletion(user.id, { attempts: 100 })

    await addToWantToBeat(wtb.id, LEVEL_ID)

    await expect(expectWantToBeatUnbeaten()).rejects.toThrow()
  })

  it('does not fire on a Want to Beat entry the user has not completed', async () => {
    const { wtb } = await seedWorld()
    await addToWantToBeat(wtb.id, LEVEL_ID)

    await expect(expectWantToBeatUnbeaten()).resolves.toBeUndefined()
  })
})

// ─── INVARIANT: one COMPLETION per LevelProgress ─────────────────────────────

describe('INVARIANT: at most one COMPLETION per level_progress', () => {
  it('holds when the same level is logged twice', async () => {
    // applyCompletion is edit-not-replace: the second log updates in place.
    const { user } = await seedWorld()

    await logCompletion(user.id, { attempts: 100 })
    await logCompletion(user.id, { attempts: 200 })

    expect(await completionCount(user.id)).toBe(1)
    const update = await prisma.progressUpdate.findFirstOrThrow({
      where: { kind: 'COMPLETION' },
    })
    expect(update.attempts).toBe(200)
    await expectNoDuplicateCompletions()
  })

  it('holds when GDDL sync runs over an already-logged completion', async () => {
    // Two independent write paths for the same level — the sync must enrich
    // the existing row, never add a second.
    const { user } = await seedWorld()
    await logCompletion(user.id, { attempts: 100 })
    mockFetchSubmissions.mockResolvedValue([gddlSubmission()])

    await syncGddlSubmissions(user.id, 'gddl-key')

    expect(await completionCount(user.id)).toBe(1)
    await expectNoDuplicateCompletions()
  })

  it('holds when GDDL sync runs twice', async () => {
    const { user } = await seedWorld()
    mockFetchSubmissions.mockResolvedValue([gddlSubmission()])

    await syncGddlSubmissions(user.id, 'gddl-key')
    await syncGddlSubmissions(user.id, 'gddl-key')

    expect(await completionCount(user.id)).toBe(1)
    await expectNoDuplicateCompletions()
  })

  it('holds when an import commits a completion for an already-completed level', async () => {
    const { user } = await seedWorld()
    await logCompletion(user.id, { attempts: 100 })

    await runImport(user.id, [
      { rowIndex: 0, data: { levelId: LEVEL_ID, attempts: 300 } },
    ])

    expect(await completionCount(user.id)).toBe(1)
    await expectNoDuplicateCompletions()
  })

  it('holds when one import batch carries two completions for one level', async () => {
    // Intra-batch supersession: the later row wins, the earlier is skipped.
    const { user } = await seedWorld()

    await runImport(user.id, [
      { rowIndex: 0, data: { levelId: LEVEL_ID, attempts: 100 } },
      { rowIndex: 1, data: { levelId: LEVEL_ID, attempts: 200 } },
    ])

    expect(await completionCount(user.id)).toBe(1)
    await expectNoDuplicateCompletions()
  })

  it('holds across all three write paths applied to one level', async () => {
    // The combination is what a real account looks like after a sync and an
    // import land on top of hand-logged progress.
    const { user } = await seedWorld()
    mockFetchSubmissions.mockResolvedValue([gddlSubmission()])

    await logCompletion(user.id, { attempts: 100 })
    await syncGddlSubmissions(user.id, 'gddl-key')
    await runImport(user.id, [
      { rowIndex: 0, data: { levelId: LEVEL_ID, attempts: 300 } },
    ])

    expect(await completionCount(user.id)).toBe(1)
    await expectNoDuplicateCompletions()
  })

  it('allows a completion alongside progress and drop rows', async () => {
    // The invariant caps COMPLETION rows only — other kinds are additive.
    const { user } = await seedWorld()
    await logCompletion(user.id, { attempts: 100 })

    const lp = await prisma.levelProgress.findFirstOrThrow({
      where: { userId: user.id, levelId: LEVEL_ID },
    })
    await prisma.progressUpdate.createMany({
      data: [
        { levelProgressId: lp.id, kind: 'PROGRESS', percentage: 50 },
        { levelProgressId: lp.id, kind: 'DROP' },
      ],
    })

    expect(await completionCount(user.id)).toBe(1)
    await expectNoDuplicateCompletions()
  })
})

// ─── INVARIANT: Want to Beat holds only unbeaten levels ──────────────────────

describe('INVARIANT: Want to Beat holds only unbeaten levels', () => {
  it('drops the level when a completion is logged', async () => {
    const { user, wtb } = await seedWorld()
    await addToWantToBeat(wtb.id, LEVEL_ID)

    await logCompletion(user.id, { attempts: 100 })

    expect(await prisma.collectionEntry.count({ where: { collectionId: wtb.id } }))
      .toBe(0)
    await expectWantToBeatUnbeaten()
  })

  it('drops the level when GDDL sync records the completion', async () => {
    const { user, wtb } = await seedWorld()
    await addToWantToBeat(wtb.id, LEVEL_ID)
    mockFetchSubmissions.mockResolvedValue([gddlSubmission()])

    await syncGddlSubmissions(user.id, 'gddl-key')

    expect(await prisma.collectionEntry.count({ where: { collectionId: wtb.id } }))
      .toBe(0)
    await expectWantToBeatUnbeaten()
  })

  it('drops the level when an import commits the completion', async () => {
    const { user, wtb } = await seedWorld()
    await addToWantToBeat(wtb.id, LEVEL_ID)

    await runImport(user.id, [
      { rowIndex: 0, data: { levelId: LEVEL_ID, attempts: 100 } },
    ])

    expect(await prisma.collectionEntry.count({ where: { collectionId: wtb.id } }))
      .toBe(0)
    await expectWantToBeatUnbeaten()
  })

  it('refuses to add an already-completed level', async () => {
    // The other direction: the level is beaten first, then someone tries to
    // add it. A 409 rather than a silent no-op so the UI can explain.
    const { user, wtb } = await seedWorld()
    await logCompletion(user.id, { attempts: 100 })

    const res = await buildApp(collectionsApp, { userId: user.id }).request(
      `/me/collections/${wtb.id}/entries`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ levelId: LEVEL_ID }),
      }
    )

    expect(res.status).toBe(409)
    expect(await prisma.collectionEntry.count({ where: { collectionId: wtb.id } }))
      .toBe(0)
    await expectWantToBeatUnbeaten()
  })

  it('still allows an unbeaten level in, and leaves it there', async () => {
    // The guard must not be so broad it blocks the collection's actual purpose.
    const { user, wtb } = await seedWorld()

    const res = await buildApp(collectionsApp, { userId: user.id }).request(
      `/me/collections/${wtb.id}/entries`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ levelId: LEVEL_ID }),
      }
    )

    expect(res.status).toBe(200)
    expect(await prisma.collectionEntry.count({ where: { collectionId: wtb.id } }))
      .toBe(1)
    await expectWantToBeatUnbeaten()
  })

  it('leaves a level in Favorites when it is completed', async () => {
    // Only Want to Beat has this rule — a beaten level belongs in Favorites.
    const { user } = await seedWorld()
    const favorites = await prisma.collection.create({
      data: { userId: user.id, name: 'Favorites', type: 'FAVORITES' },
    })
    await addToWantToBeat(favorites.id, LEVEL_ID)

    await logCompletion(user.id, { attempts: 100 })

    expect(
      await prisma.collectionEntry.count({ where: { collectionId: favorites.id } })
    ).toBe(1)
    await expectWantToBeatUnbeaten()
  })

  it('does not touch another user’s Want to Beat', async () => {
    // removeFromWantToBeat filters on the owning user; a shared level id must
    // not clear someone else's entry.
    const { user, wtb } = await seedWorld()
    const other = await seedUser(prisma)
    const otherWtb = await prisma.collection.create({
      data: { userId: other.id, name: 'Want to Beat', type: 'WANT_TO_BEAT' },
    })
    await addToWantToBeat(wtb.id, LEVEL_ID)
    await addToWantToBeat(otherWtb.id, LEVEL_ID)

    await logCompletion(user.id, { attempts: 100 })

    expect(await prisma.collectionEntry.count({ where: { collectionId: wtb.id } }))
      .toBe(0)
    expect(
      await prisma.collectionEntry.count({ where: { collectionId: otherWtb.id } })
    ).toBe(1)
    await expectWantToBeatUnbeaten()
  })
})
