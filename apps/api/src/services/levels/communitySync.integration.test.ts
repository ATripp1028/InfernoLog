/**
 * Integration tests for the community-list cache write (communitySync.ts), the
 * rotation that drives it (runCommunitySyncSlice) and the bulk AREDL pass
 * (runAredlListSync). All Prisma calls hit the local test database (started by
 * globalSetup); only the three HTTP clients are mocked, so the real write path —
 * including the priority merge and which columns a not-found must leave alone —
 * runs against real rows.
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

// Mock only the HTTP clients; the cache writes run for real.
vi.mock('../../utils/globalStatsViewer', () => ({
  fetchGlobalStatsViewerLevel: vi.fn(),
}))
vi.mock('../../utils/gddl', () => ({ fetchGddlLevel: vi.fn() }))
vi.mock('../../utils/aredl', () => ({
  fetchAredlLevel: vi.fn(),
  fetchAredlList: vi.fn(),
}))

// RobTop is never called by these paths, but sync.ts imports it at module load.
vi.mock('../../utils/robtop', () => ({ fetchRobtopLevelResult: vi.fn() }))

const {
  checkAndPersistCommunity,
  checkCommunityIfDue,
  checkCommunityForSeededLevels,
  COMMUNITY_RECHECK_DAYS,
  PARTIAL_RETRY_HOURS,
} = await import('./communitySync')
const { runCommunitySyncSlice, runAredlListSync } = await import('./sync')
const { fetchGlobalStatsViewerLevel } = await import(
  '../../utils/globalStatsViewer'
)
const { fetchGddlLevel } = await import('../../utils/gddl')
const { fetchAredlLevel, fetchAredlList } = await import('../../utils/aredl')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = getTestPrisma()
type Mock = ReturnType<typeof vi.fn>
const gsvMock = fetchGlobalStatsViewerLevel as unknown as Mock
const gddlMock = fetchGddlLevel as unknown as Mock
const aredlMock = fetchAredlLevel as unknown as Mock
const aredlListMock = fetchAredlList as unknown as Mock

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS)

function gsvResult(overrides: Record<string, unknown> = {}) {
  return {
    gddlTier: 39,
    aredlRank: 5,
    sheetTier: 20,
    showcaseUrl: 'https://www.youtube.com/watch?v=gsvgsvgsvg',
    objectCount: 220116,
    durationSeconds: 240,
    ...overrides,
  }
}

function gddlResult(overrides: Record<string, unknown> = {}) {
  return {
    tier: 33,
    enjoyment: 50,
    showcaseUrl: 'https://www.youtube.com/watch?v=gddlgddlgdd',
    seconds: 121,
    objectCount: 23156,
    ...overrides,
  }
}

function aredlResult(overrides: Record<string, unknown> = {}) {
  return {
    position: 216,
    status: 'MainList',
    enjoyment: 59.4,
    enjoymentPending: false,
    sheetTier: 12,
    showcaseUrl: 'https://www.youtube.com/watch?v=aredlaredla',
    ...overrides,
  }
}

// Every source answers by default, so a test that cares about one of them
// doesn't accidentally exercise the no-downgrade rule instead.
function allAnswer() {
  gsvMock.mockResolvedValue(gsvResult())
  gddlMock.mockResolvedValue(gddlResult())
  aredlMock.mockResolvedValue(aredlResult())
}

// A cached level in the state the rotation considers eligible. isDemon defaults
// true so all three sources apply.
async function seedLevel(
  overrides: Partial<{
    inGameId: string
    isRated: boolean
    isDemon: boolean
    delistedAt: Date | null
    communityCheckedAt: Date | null
    objectCount: number | null
    gddlTier: number | null
    aredlRank: number | null
    aredlStatus: string | null
    showcaseUrl: string | null
    sheetTier: number | null
    enjoyment: number | null
    partialDiff: string | null
  }> = {}
) {
  return prisma.level.create({
    data: {
      inGameId: overrides.inGameId ?? '86407629',
      name: 'Tidal Wave',
      creator: 'OniLinkGD',
      dataSource: 'robtop_autofill',
      verified: true,
      isDemon: overrides.isDemon ?? true,
      isRated: overrides.isRated ?? true,
      delistedAt: overrides.delistedAt ?? null,
      communityCheckedAt: overrides.communityCheckedAt ?? null,
      objectCount: overrides.objectCount ?? null,
      gddlTier: overrides.gddlTier ?? null,
      aredlRank: overrides.aredlRank ?? null,
      aredlStatus: overrides.aredlStatus ?? null,
      showcaseUrl: overrides.showcaseUrl ?? null,
      sheetTier: overrides.sheetTier ?? null,
      enjoyment: overrides.enjoyment ?? null,
      // Extreme by default, so the EDEL branch is what the general-purpose
      // tests exercise; the GDDL branch overrides it.
      partialDiff: overrides.partialDiff ?? 'demon-extreme',
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
  gddlMock.mockReset()
  aredlMock.mockReset()
  aredlListMock.mockReset()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── checkAndPersistCommunity: the priority merge ────────────────────────────

describe('checkAndPersistCommunity', () => {
  it('caches every column and stamps communityCheckedAt', async () => {
    await seedLevel({ objectCount: 65535 })
    allAnswer()

    await expect(checkAndPersistCommunity('86407629')).resolves.toBe('found')

    const level = await readLevel('86407629')
    // GDDL and AREDL outrank GSV on the columns all three carry.
    expect(level.gddlTier).toBe(33)
    expect(level.aredlRank).toBe(216)
    expect(level.sheetTier).toBe(12)
    expect(level.showcaseUrl).toBe(
      'https://www.youtube.com/watch?v=aredlaredla'
    )
    expect(level.durationSeconds).toBe(121)
    expect(level.aredlStatus).toBe('MainList')
    // An extreme takes EDEL's score, not GDDL's, even though both answered.
    expect(Number(level.enjoyment)).toBeCloseTo(59.4)
    expect(level.enjoymentPending).toBe(false)
    // GSV's count supersedes RobTop's 65535 over-the-limit placeholder.
    expect(level.objectCount).toBe(220116)
    expect(level.communityCheckedAt).not.toBeNull()
  })

  it('falls through to GSV for a listworthy sheet tier AREDL cannot name', async () => {
    await seedLevel()
    // AREDL's nlw_tier only spans 0-14, so a listworthy level comes back null
    // there and GSV's SHEET entry is the only source of 15-21.
    gsvMock.mockResolvedValue(gsvResult({ sheetTier: 20 }))
    gddlMock.mockResolvedValue(gddlResult())
    aredlMock.mockResolvedValue(aredlResult({ sheetTier: null }))

    await checkAndPersistCommunity('86407629')

    expect((await readLevel('86407629')).sheetTier).toBe(20)
  })

  it('persists sheet tier 0 — the "Fuck" tier is a placement, not an absence', async () => {
    await seedLevel()
    // Reported by AREDL now, not inferred from a missing GSV SHEET entry.
    gsvMock.mockResolvedValue(gsvResult({ sheetTier: null }))
    gddlMock.mockResolvedValue(gddlResult())
    aredlMock.mockResolvedValue(aredlResult({ sheetTier: 0 }))

    await checkAndPersistCommunity('86407629')

    expect((await readLevel('86407629')).sheetTier).toBe(0)
  })

  it('falls through the showcase priority when a source has none', async () => {
    await seedLevel()
    gsvMock.mockResolvedValue(gsvResult({ showcaseUrl: null }))
    gddlMock.mockResolvedValue(gddlResult())
    aredlMock.mockResolvedValue(aredlResult({ showcaseUrl: null }))

    await checkAndPersistCommunity('86407629')

    expect((await readLevel('86407629')).showcaseUrl).toBe(
      'https://www.youtube.com/watch?v=gddlgddlgdd'
    )
  })

  // The no-downgrade rule. Without it a single AREDL timeout would rewrite the
  // showcase to GDDL's copy and rewrite it back on the next pass — a real write
  // and a visible change every time a source blinks.
  it('leaves a column untouched when its top source did not answer', async () => {
    await seedLevel({ showcaseUrl: 'https://www.youtube.com/watch?v=aredlaredla' })
    gsvMock.mockResolvedValue(gsvResult())
    gddlMock.mockResolvedValue(gddlResult())
    aredlMock.mockResolvedValue(undefined) // AREDL down

    await checkAndPersistCommunity('86407629')

    const level = await readLevel('86407629')
    expect(level.showcaseUrl).toBe('https://www.youtube.com/watch?v=aredlaredla')
    // aredlRank and sheetTier are AREDL-topped too, so they hold as well.
    expect(level.aredlRank).toBeNull()
    // GDDL answered, so its own columns are written as normal.
    expect(level.gddlTier).toBe(33)
    expect(level.durationSeconds).toBe(121)
  })

  // Enjoyment is chosen by difficulty, never by which source answered first.
  it('takes GDDL’s score for a level below extreme', async () => {
    await seedLevel({ partialDiff: 'demon-insane' })
    allAnswer()

    await checkAndPersistCommunity('86407629')

    const level = await readLevel('86407629')
    expect(Number(level.enjoyment)).toBe(50)
    // EDEL's flag belongs to EDEL's score and must not ride along with GDDL's.
    expect(level.enjoymentPending).toBeNull()
  })

  // "Insane demons and below always use GDDL, no exceptions" — including a
  // level demoted off AREDL, which still carries a real EDEL score.
  it('takes GDDL’s score for a demoted level that still has an EDEL one', async () => {
    await seedLevel({ partialDiff: 'demon-insane' })
    gsvMock.mockResolvedValue(gsvResult())
    gddlMock.mockResolvedValue(gddlResult({ enjoyment: 50 }))
    aredlMock.mockResolvedValue(
      aredlResult({ status: 'Legacy', enjoyment: 41.2 })
    )

    await checkAndPersistCommunity('86407629')

    const level = await readLevel('86407629')
    expect(Number(level.enjoyment)).toBe(50)
    expect(level.aredlStatus).toBe('Legacy')
  })

  // The featured variant of the token must not fall through to the GDDL branch.
  it('treats a featured extreme as an extreme', async () => {
    await seedLevel({ partialDiff: 'demon-extreme-featured' })
    allAnswer()

    await checkAndPersistCommunity('86407629')

    expect(Number((await readLevel('86407629')).enjoyment)).toBeCloseTo(59.4)
  })

  // An extreme EDEL hasn't rated stores nothing: a level absent from EDEL is
  // unlikely to be rated on GDDL either, so GDDL is not a fallback here.
  it('stores no enjoyment for an extreme EDEL has not rated', async () => {
    await seedLevel({ partialDiff: 'demon-extreme' })
    gsvMock.mockResolvedValue(gsvResult())
    gddlMock.mockResolvedValue(gddlResult({ enjoyment: 50 }))
    aredlMock.mockResolvedValue(aredlResult({ enjoyment: null }))

    await checkAndPersistCommunity('86407629')

    expect((await readLevel('86407629')).enjoyment).toBeNull()
  })

  it('clears a placement the level no longer holds', async () => {
    await seedLevel({ gddlTier: 12, aredlRank: 4, aredlStatus: 'MainList' })
    gsvMock.mockResolvedValue(gsvResult({ gddlTier: null, aredlRank: null }))
    gddlMock.mockResolvedValue(gddlResult({ tier: null }))
    aredlMock.mockResolvedValue(null) // no longer on AREDL

    await checkAndPersistCommunity('86407629')

    const level = await readLevel('86407629')
    expect(level.gddlTier).toBeNull()
    expect(level.aredlRank).toBeNull()
    expect(level.aredlStatus).toBeNull()
  })

  it('leaves RobTop’s object count standing when GSV has none', async () => {
    await seedLevel({ objectCount: 4242 })
    gsvMock.mockResolvedValue(gsvResult({ objectCount: null }))
    gddlMock.mockResolvedValue(gddlResult())
    aredlMock.mockResolvedValue(aredlResult())

    await checkAndPersistCommunity('86407629')

    expect((await readLevel('86407629')).objectCount).toBe(4242)
  })

  it('stamps communityCheckedAt but touches nothing else when no source has the level', async () => {
    await seedLevel({ gddlTier: 12, objectCount: 4242 })
    gsvMock.mockResolvedValue(null)
    gddlMock.mockResolvedValue(null)
    aredlMock.mockResolvedValue(null)

    await expect(checkAndPersistCommunity('86407629')).resolves.toBe('none')

    const level = await readLevel('86407629')
    // A GSV 404 is far more likely an upstream gap than a real de-listing from
    // every list at once, so an existing placement it can't speak to survives.
    expect(level.objectCount).toBe(4242)
    expect(level.communityCheckedAt).not.toBeNull()
  })

  it('writes nothing when no source answers, leaving the level due', async () => {
    await seedLevel({ gddlTier: 12 })
    gsvMock.mockResolvedValue(undefined)
    gddlMock.mockResolvedValue(undefined)
    aredlMock.mockResolvedValue(undefined)

    await expect(checkAndPersistCommunity('86407629')).resolves.toBe('failed')

    const level = await readLevel('86407629')
    expect(level.gddlTier).toBe(12)
    expect(level.communityCheckedAt).toBeNull()
  })

  // Withholding the stamp on a partial failure would pin every demon in the
  // cache as permanently due the moment GDDL throttles us. Backdating gets the
  // retry without the storm.
  it('backdates communityCheckedAt when only some sources answered', async () => {
    await seedLevel()
    gsvMock.mockResolvedValue(gsvResult())
    gddlMock.mockResolvedValue(undefined)
    aredlMock.mockResolvedValue(aredlResult())

    await checkAndPersistCommunity('86407629')

    const { communityCheckedAt } = await readLevel('86407629')
    expect(communityCheckedAt).not.toBeNull()
    const dueIn =
      communityCheckedAt!.getTime() +
      COMMUNITY_RECHECK_DAYS * DAY_MS -
      Date.now()
    expect(dueIn).toBeLessThanOrEqual(PARTIAL_RETRY_HOURS * 60 * 60 * 1000)
    expect(dueIn).toBeGreaterThan(0)
  })

  it('only calls the sources that index the level', async () => {
    await seedLevel({ inGameId: 'nondemon', isDemon: false })
    allAnswer()

    await checkAndPersistCommunity('nondemon')

    // GSV carries rated levels; GDDL and AREDL are demons only.
    expect(gsvMock).toHaveBeenCalledTimes(1)
    expect(gddlMock).not.toHaveBeenCalled()
    expect(aredlMock).not.toHaveBeenCalled()
  })
})

// ─── checkCommunityIfDue (the /resolve gate) ─────────────────────────────────

describe('checkCommunityIfDue', () => {
  it('checks a level that has never been checked', async () => {
    await seedLevel()
    allAnswer()

    await checkCommunityIfDue('86407629')

    expect(gsvMock).toHaveBeenCalledTimes(1)
    expect((await readLevel('86407629')).gddlTier).toBe(33)
  })

  it('skips a level checked inside the re-check window', async () => {
    await seedLevel({ communityCheckedAt: daysAgo(1) })

    await checkCommunityIfDue('86407629')

    expect(gsvMock).not.toHaveBeenCalled()
  })

  it('re-checks a level whose last check aged past the window', async () => {
    await seedLevel({ communityCheckedAt: daysAgo(COMMUNITY_RECHECK_DAYS + 1) })
    allAnswer()

    await checkCommunityIfDue('86407629')

    expect(gsvMock).toHaveBeenCalledTimes(1)
  })

  it('skips a level no source indexes', async () => {
    await seedLevel({ isRated: false, isDemon: false })

    await expect(checkCommunityIfDue('86407629')).resolves.toBe('skipped')
    expect(gsvMock).not.toHaveBeenCalled()
  })

  it('still checks an unrated DEMON — GDDL and AREDL do not require a rating', async () => {
    await seedLevel({ isRated: false })
    allAnswer()

    await checkCommunityIfDue('86407629')

    expect(gsvMock).not.toHaveBeenCalled()
    expect(gddlMock).toHaveBeenCalledTimes(1)
    expect(aredlMock).toHaveBeenCalledTimes(1)
  })

  it('skips a delisted level', async () => {
    await seedLevel({ delistedAt: new Date() })

    await checkCommunityIfDue('86407629')

    expect(gsvMock).not.toHaveBeenCalled()
  })

  it('is a no-op for a level that is not cached', async () => {
    await expect(checkCommunityIfDue('nope')).resolves.toBe('skipped')
    expect(gsvMock).not.toHaveBeenCalled()
  })

  // The batch helper paces only between calls that actually went out, so it
  // needs to know a gated check did nothing — 'skipped' is that signal, and it
  // must stay distinct from the 'failed' a real but unsuccessful call returns.
  it('reports what it did, separating a skip from a real outcome', async () => {
    await seedLevel({ inGameId: 'due' })
    await seedLevel({ inGameId: 'fresh', communityCheckedAt: daysAgo(1) })
    allAnswer()

    await expect(checkCommunityIfDue('due')).resolves.toBe('found')
    await expect(checkCommunityIfDue('fresh')).resolves.toBe('skipped')
  })
})

// ─── checkCommunityForSeededLevels (every RobTop seed path) ──────────────────

describe('checkCommunityForSeededLevels', () => {
  it('checks each level just seeded from RobTop', async () => {
    await seedLevel({ inGameId: 'a' })
    await seedLevel({ inGameId: 'b' })
    allAnswer()

    await checkCommunityForSeededLevels(['a', 'b'])

    expect(gsvMock.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
    expect((await readLevel('a')).gddlTier).toBe(33)
    expect((await readLevel('b')).gddlTier).toBe(33)
  })

  it('skips levels the gate rules out, without calling out for them', async () => {
    await seedLevel({ inGameId: 'demon' })
    await seedLevel({ inGameId: 'neither', isRated: false, isDemon: false })
    await seedLevel({ inGameId: 'delisted', delistedAt: new Date() })
    await seedLevel({ inGameId: 'fresh', communityCheckedAt: daysAgo(1) })
    allAnswer()

    await checkCommunityForSeededLevels([
      'demon',
      'neither',
      'delisted',
      'fresh',
    ])

    expect(gsvMock.mock.calls.map((c) => c[0])).toEqual(['demon'])
  })

  // A seed path must never fail because a community list is having a bad day.
  it('keeps going when a level fails, and never throws', async () => {
    await seedLevel({ inGameId: 'a' })
    await seedLevel({ inGameId: 'b' })
    gsvMock.mockResolvedValue(undefined)
    aredlMock.mockResolvedValue(undefined)
    gddlMock.mockResolvedValueOnce(undefined).mockResolvedValue(gddlResult())

    await expect(
      checkCommunityForSeededLevels(['a', 'b'])
    ).resolves.toBeUndefined()

    expect((await readLevel('a')).communityCheckedAt).toBeNull()
    expect((await readLevel('b')).gddlTier).toBe(33)
  })

  it('does nothing for an empty batch', async () => {
    await expect(checkCommunityForSeededLevels([])).resolves.toBeUndefined()
    expect(gsvMock).not.toHaveBeenCalled()
  })
})

// ─── runAredlListSync (the bulk pass) ────────────────────────────────────────

describe('runAredlListSync', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    levelId: '86407629',
    position: 216,
    status: 'MainList',
    enjoyment: 59.4,
    enjoymentPending: false,
    sheetTier: 12,
    ...overrides,
  })

  it('writes AREDL columns for every cached level on the list', async () => {
    await seedLevel()
    aredlListMock.mockResolvedValue(new Map([['86407629', entry()]]))

    await runAredlListSync()

    const level = await readLevel('86407629')
    expect(level.aredlRank).toBe(216)
    expect(level.aredlStatus).toBe('MainList')
    expect(Number(level.enjoyment)).toBeCloseTo(59.4)
    // sheetTier is merged with GSV, so the bulk pass deliberately leaves it.
    expect(level.sheetTier).toBeNull()
  })

  // Below extreme the enjoyment column holds GDDL's score. This pass carries
  // EDEL's, so it must not write there — nor clear it when the level drops off
  // the list, which would delete a figure AREDL never owned.
  it('leaves a non-extreme’s enjoyment alone in both directions', async () => {
    await seedLevel({ partialDiff: 'demon-insane', enjoyment: 50 })

    aredlListMock.mockResolvedValue(new Map([['86407629', entry()]]))
    await runAredlListSync()
    expect(Number((await readLevel('86407629')).enjoyment)).toBe(50)

    aredlListMock.mockResolvedValue(new Map())
    await runAredlListSync()
    const level = await readLevel('86407629')
    expect(Number(level.enjoyment)).toBe(50)
    expect(level.aredlRank).toBeNull()
  })

  it('clears an extreme’s enjoyment when it falls off the list', async () => {
    await seedLevel({ aredlRank: 216, aredlStatus: 'MainList', enjoyment: 59.4 })
    aredlListMock.mockResolvedValue(new Map())

    await runAredlListSync()

    expect((await readLevel('86407629')).enjoyment).toBeNull()
  })

  it('clears a level that has fallen off the list', async () => {
    await seedLevel({ aredlRank: 216, aredlStatus: 'MainList' })
    aredlListMock.mockResolvedValue(new Map())

    await runAredlListSync()

    const level = await readLevel('86407629')
    expect(level.aredlRank).toBeNull()
    expect(level.aredlStatus).toBeNull()
  })

  // An empty list must read as "we couldn't ask", never as "AREDL is empty" —
  // otherwise one bad fetch wipes ~1600 levels.
  it('clears nothing when the list fetch fails', async () => {
    await seedLevel({ aredlRank: 216, aredlStatus: 'MainList' })
    aredlListMock.mockResolvedValue(undefined)

    await expect(runAredlListSync()).resolves.toBeUndefined()

    expect((await readLevel('86407629')).aredlRank).toBe(216)
  })
})

// ─── runCommunitySyncSlice (the rotation) ────────────────────────────────────

describe('runCommunitySyncSlice', () => {
  it('checks only due, indexed, non-delisted levels and advances the cursor', async () => {
    await seedLevel({ inGameId: 'a-due' })
    await seedLevel({ inGameId: 'b-fresh', communityCheckedAt: daysAgo(1) })
    await seedLevel({
      inGameId: 'c-neither',
      isRated: false,
      isDemon: false,
    })
    await seedLevel({ inGameId: 'd-delisted', delistedAt: new Date() })
    await seedLevel({ inGameId: 'e-stale', communityCheckedAt: daysAgo(30) })
    allAnswer()

    const result = await runCommunitySyncSlice(undefined, 50, 0)

    expect(result.processed).toBe(2)
    expect(result.found).toBe(2)
    expect(gsvMock.mock.calls.map((c) => c[0]).sort()).toEqual([
      'a-due',
      'e-stale',
    ])

    const cursor = await prisma.levelSyncCursor.findUnique({
      where: { id: 'community' },
    })
    expect(cursor?.lastInGameId).toBe('e-stale')
  })

  // The bulk list already knows the whole AREDL universe, so a level that isn't
  // on it must not cost a per-level request just to be told 404.
  it('skips the per-level AREDL call for a level the bulk list does not carry', async () => {
    await seedLevel({ inGameId: 'a' })
    allAnswer()

    await runCommunitySyncSlice(new Map(), 50, 0)

    expect(gsvMock).toHaveBeenCalledTimes(1)
    expect(aredlMock).not.toHaveBeenCalled()
  })

  it('tallies not-founds and failures separately without aborting the slice', async () => {
    await seedLevel({ inGameId: 'a' })
    await seedLevel({ inGameId: 'b' })
    await seedLevel({ inGameId: 'c' })
    gddlMock.mockResolvedValue(null)
    aredlMock.mockResolvedValue(null)
    gsvMock
      .mockResolvedValueOnce(gsvResult())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined)

    const result = await runCommunitySyncSlice(undefined, 50, 0)

    // The third level's GSV call failed, but GDDL and AREDL both answered, so
    // it is a partial pass — data was written, hence 'none' rather than
    // 'failed'. Only a level where NOTHING answered counts as failed.
    expect(result).toMatchObject({ processed: 3, found: 1, none: 2, failed: 0 })
  })

  it('counts a level as failed only when no source answered', async () => {
    await seedLevel({ inGameId: 'a' })
    gsvMock.mockResolvedValue(undefined)
    gddlMock.mockResolvedValue(undefined)
    aredlMock.mockResolvedValue(undefined)

    const result = await runCommunitySyncSlice(undefined, 50, 0)

    expect(result).toMatchObject({ processed: 1, failed: 1 })
  })

  it('resumes after the cursor and wraps once the rotation runs out', async () => {
    await seedLevel({ inGameId: 'a' })
    await seedLevel({ inGameId: 'b' })
    // Every source silent keeps every level due.
    gsvMock.mockResolvedValue(undefined)
    gddlMock.mockResolvedValue(undefined)
    aredlMock.mockResolvedValue(undefined)

    await runCommunitySyncSlice(undefined, 1, 0)
    expect(gsvMock.mock.calls.map((c) => c[0])).toEqual(['a'])

    await runCommunitySyncSlice(undefined, 1, 0)
    expect(gsvMock.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])

    // Cursor is past the last id — the next run wraps to the start.
    await runCommunitySyncSlice(undefined, 1, 0)
    expect(gsvMock.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a'])
  })

  it('does nothing when no level is due', async () => {
    await seedLevel({ communityCheckedAt: daysAgo(1) })

    const result = await runCommunitySyncSlice(undefined, 50, 0)

    expect(result.processed).toBe(0)
    expect(gsvMock).not.toHaveBeenCalled()
  })
})
