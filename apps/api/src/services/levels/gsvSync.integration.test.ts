/**
 * Integration tests for the Global Stats Viewer cache write (gsvSync.ts) and
 * the rotation that drives it (runGsvSyncSlice). All Prisma calls hit the local
 * test database (started by globalSetup); only the GSV HTTP client is mocked, so
 * the real write path — including which columns a 404 must leave alone — runs
 * against real rows.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma, truncateAll } from '../../test/utils'

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@sentry/aws-serverless', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

// Mock only the GSV HTTP client; the cache write runs for real.
vi.mock('../../utils/globalStatsViewer', () => ({
  fetchGlobalStatsViewerLevel: vi.fn(),
}))

// RobTop is never called by these paths, but sync.ts imports it at module load.
vi.mock('../../utils/robtop', () => ({ fetchRobtopLevelResult: vi.fn() }))

const { checkAndPersistGsv, checkGsvIfDue, GSV_RECHECK_DAYS } = await import(
  './gsvSync'
)
const { runGsvSyncSlice } = await import('./sync')
const { fetchGlobalStatsViewerLevel } = await import(
  '../../utils/globalStatsViewer'
)

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = getTestPrisma()
const gsvMock = fetchGlobalStatsViewerLevel as unknown as ReturnType<
  typeof vi.fn
>

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS)

function gsvResult(overrides: Record<string, unknown> = {}) {
  return {
    gddlTier: 39,
    aredlRank: 5,
    sheetTier: 20,
    showcaseUrl: 'https://youtu.be/6v_pWirR72Q',
    objectCount: 220116,
    ...overrides,
  }
}

// A cached level in the state the GSV rotation considers eligible.
async function seedLevel(
  overrides: Partial<{
    inGameId: string
    isRated: boolean
    delistedAt: Date | null
    gsvCheckedAt: Date | null
    objectCount: number | null
    gddlTier: number | null
  }> = {}
) {
  return prisma.level.create({
    data: {
      inGameId: overrides.inGameId ?? '86407629',
      name: 'Tidal Wave',
      creator: 'OniLinkGD',
      dataSource: 'robtop_autofill',
      verified: true,
      isDemon: true,
      isRated: overrides.isRated ?? true,
      delistedAt: overrides.delistedAt ?? null,
      gsvCheckedAt: overrides.gsvCheckedAt ?? null,
      objectCount: overrides.objectCount ?? null,
      gddlTier: overrides.gddlTier ?? null,
    },
  })
}

const readLevel = (inGameId: string) =>
  prisma.level.findUniqueOrThrow({ where: { inGameId } })

beforeEach(async () => {
  await truncateAll(prisma)
  // The round-robin cursor lives outside truncateAll's table list; reset it so
  // each test starts a fresh rotation.
  await prisma.levelSyncCursor.deleteMany({})
  gsvMock.mockReset()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── checkAndPersistGsv ──────────────────────────────────────────────────────

describe('checkAndPersistGsv', () => {
  it('caches every placement plus the object count and stamps gsvCheckedAt', async () => {
    await seedLevel({ objectCount: 65535 })
    gsvMock.mockResolvedValue(gsvResult())

    await expect(checkAndPersistGsv('86407629')).resolves.toBe('found')

    const level = await readLevel('86407629')
    expect(level.gddlTier).toBe(39)
    expect(level.aredlRank).toBe(5)
    expect(level.sheetTier).toBe(20)
    expect(level.showcaseUrl).toBe('https://youtu.be/6v_pWirR72Q')
    // GSV's count supersedes RobTop's 65535 over-the-limit placeholder.
    expect(level.objectCount).toBe(220116)
    expect(level.gsvCheckedAt).not.toBeNull()
  })

  it('persists sheet tier 0 — the "Fuck" tier is a placement, not an absence', async () => {
    await seedLevel()
    gsvMock.mockResolvedValue(gsvResult({ sheetTier: 0 }))

    await checkAndPersistGsv('86407629')

    expect((await readLevel('86407629')).sheetTier).toBe(0)
  })

  it('clears a placement the level no longer holds', async () => {
    await seedLevel({ gddlTier: 12 })
    gsvMock.mockResolvedValue(gsvResult({ gddlTier: null, aredlRank: null }))

    await checkAndPersistGsv('86407629')

    const level = await readLevel('86407629')
    expect(level.gddlTier).toBeNull()
    expect(level.aredlRank).toBeNull()
  })

  it('leaves RobTop’s object count standing when GSV has none', async () => {
    await seedLevel({ objectCount: 4242 })
    gsvMock.mockResolvedValue(gsvResult({ objectCount: null }))

    await checkAndPersistGsv('86407629')

    expect((await readLevel('86407629')).objectCount).toBe(4242)
  })

  it('stamps gsvCheckedAt but touches nothing else on a 404', async () => {
    await seedLevel({ gddlTier: 12, objectCount: 4242 })
    gsvMock.mockResolvedValue(null)

    await expect(checkAndPersistGsv('86407629')).resolves.toBe('none')

    const level = await readLevel('86407629')
    // Not indexed is far more likely an upstream gap than a real de-listing
    // from all three lists, so existing placements survive.
    expect(level.gddlTier).toBe(12)
    expect(level.objectCount).toBe(4242)
    expect(level.gsvCheckedAt).not.toBeNull()
  })

  it('writes nothing on a failed call, leaving the level due for a retry', async () => {
    await seedLevel({ gddlTier: 12 })
    gsvMock.mockResolvedValue(undefined)

    await expect(checkAndPersistGsv('86407629')).resolves.toBe('failed')

    const level = await readLevel('86407629')
    expect(level.gddlTier).toBe(12)
    expect(level.gsvCheckedAt).toBeNull()
  })
})

// ─── checkGsvIfDue (the /resolve gate) ───────────────────────────────────────

describe('checkGsvIfDue', () => {
  it('checks a level that has never been checked', async () => {
    await seedLevel()
    gsvMock.mockResolvedValue(gsvResult())

    await checkGsvIfDue('86407629')

    expect(gsvMock).toHaveBeenCalledTimes(1)
    expect((await readLevel('86407629')).gddlTier).toBe(39)
  })

  it('skips a level checked inside the re-check window', async () => {
    await seedLevel({ gsvCheckedAt: daysAgo(1) })

    await checkGsvIfDue('86407629')

    expect(gsvMock).not.toHaveBeenCalled()
  })

  it('re-checks a level whose last check aged past the window', async () => {
    await seedLevel({ gsvCheckedAt: daysAgo(GSV_RECHECK_DAYS + 1) })
    gsvMock.mockResolvedValue(gsvResult())

    await checkGsvIfDue('86407629')

    expect(gsvMock).toHaveBeenCalledTimes(1)
  })

  it('skips an unrated level — GSV indexes rated levels only', async () => {
    await seedLevel({ isRated: false })

    await checkGsvIfDue('86407629')

    expect(gsvMock).not.toHaveBeenCalled()
  })

  it('skips a delisted level', async () => {
    await seedLevel({ delistedAt: new Date() })

    await checkGsvIfDue('86407629')

    expect(gsvMock).not.toHaveBeenCalled()
  })

  it('is a no-op for a level that is not cached', async () => {
    await expect(checkGsvIfDue('nope')).resolves.toBeUndefined()
    expect(gsvMock).not.toHaveBeenCalled()
  })
})

// ─── runGsvSyncSlice (the rotation) ──────────────────────────────────────────

describe('runGsvSyncSlice', () => {
  it('checks only due, rated, non-delisted levels and advances the cursor', async () => {
    await seedLevel({ inGameId: 'a-due' })
    await seedLevel({ inGameId: 'b-fresh', gsvCheckedAt: daysAgo(1) })
    await seedLevel({ inGameId: 'c-unrated', isRated: false })
    await seedLevel({ inGameId: 'd-delisted', delistedAt: new Date() })
    await seedLevel({ inGameId: 'e-stale', gsvCheckedAt: daysAgo(30) })
    gsvMock.mockResolvedValue(gsvResult())

    const result = await runGsvSyncSlice(50, 0)

    expect(result.processed).toBe(2)
    expect(result.found).toBe(2)
    expect(gsvMock.mock.calls.map((c) => c[0]).sort()).toEqual([
      'a-due',
      'e-stale',
    ])

    const cursor = await prisma.levelSyncCursor.findUnique({
      where: { id: 'gsv' },
    })
    expect(cursor?.lastInGameId).toBe('e-stale')
  })

  it('tallies 404s and failures separately without aborting the slice', async () => {
    await seedLevel({ inGameId: 'a' })
    await seedLevel({ inGameId: 'b' })
    await seedLevel({ inGameId: 'c' })
    gsvMock
      .mockResolvedValueOnce(gsvResult())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined)

    const result = await runGsvSyncSlice(50, 0)

    expect(result).toMatchObject({
      processed: 3,
      found: 1,
      none: 1,
      failed: 1,
    })
  })

  it('resumes after the cursor and wraps once the rotation runs out', async () => {
    await seedLevel({ inGameId: 'a' })
    await seedLevel({ inGameId: 'b' })
    gsvMock.mockResolvedValue(undefined) // keep every level due

    await runGsvSyncSlice(1, 0)
    expect(gsvMock.mock.calls.map((c) => c[0])).toEqual(['a'])

    await runGsvSyncSlice(1, 0)
    expect(gsvMock.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])

    // Cursor is past the last id — the next run wraps to the start.
    await runGsvSyncSlice(1, 0)
    expect(gsvMock.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a'])
  })

  it('does nothing when no level is due', async () => {
    await seedLevel({ gsvCheckedAt: daysAgo(1) })

    const result = await runGsvSyncSlice(50, 0)

    expect(result.processed).toBe(0)
    expect(gsvMock).not.toHaveBeenCalled()
  })
})
