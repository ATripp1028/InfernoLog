/**
 * Integration tests for the shared RobTop sync core (services/levelSync.ts).
 * All Prisma calls hit the local test database (started by globalSetup); the
 * RobTop HTTP client is mocked so the tests run without network access.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTestPrisma, truncateAll } from '../../test/utils'
import type { RobtopLevel } from '../../utils/robtop'

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

vi.mock('../../utils/robtop', () => ({ fetchRobtopLevelResult: vi.fn() }))
// Mock only the SFH HTTP client; the sfhSync cache write runs for real.
vi.mock('../../utils/songFileHub', () => ({ fetchSongFileHubNong: vi.fn() }))

// Import after vi.mock so levelSync picks up the mocked modules.
const { syncLevelBatch, runLevelSyncSlice, runDelistedReverifySlice } =
  await import('../levels/sync')
const { fetchRobtopLevelResult } = await import('../../utils/robtop')
const { fetchSongFileHubNong } = await import('../../utils/songFileHub')
const Sentry = await import('@sentry/aws-serverless')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = getTestPrisma()
const resultMock = fetchRobtopLevelResult as unknown as ReturnType<typeof vi.fn>
const sfhMock = fetchSongFileHubNong as unknown as ReturnType<typeof vi.fn>
const captureMessageMock = vi.mocked(Sentry.captureMessage)

// Reads a round-robin cursor directly (the module's readCursor is private).
async function readCursor(
  key: 'singleton' | 'reverify' = 'singleton'
): Promise<string | null> {
  const row = await prisma.levelSyncCursor.findUnique({
    where: { id: key },
    select: { lastInGameId: true },
  })
  return row?.lastInGameId ?? null
}

// Seeds N cached levels with sequential ids ('id-1'..'id-N') so a batch can be
// long enough to exercise the circuit breaker.
async function seedN(n: number): Promise<string[]> {
  const ids: string[] = []
  for (let i = 1; i <= n; i++) {
    const inGameId = `id-${i}`
    await seedCachedLevel({ inGameId })
    ids.push(inGameId)
  }
  return ids
}

// Back-compat shim: the sync now consumes fetchRobtopLevelResult (which keeps
// the not-found vs unreachable distinction), but most tests here only care about
// "the RobtopLevel or null RobTop returned". This translates that older contract
// to the result shape — a level → { found }, null → { not_found } — so existing
// call sites need no change. A test exercising the unreachable branch (which must
// NOT delist) drives `resultMock` directly with { status: 'unreachable' }.
// Each mutating method returns `robtopMock` so chained calls
// (.mockRejectedValueOnce(...).mockResolvedValueOnce(...)) stay wrapped rather
// than falling through to the raw resultMock.
const robtopMock = {
  mockReset: () => {
    resultMock.mockReset()
    return robtopMock
  },
  mockClear: () => {
    resultMock.mockClear()
    return robtopMock
  },
  mockResolvedValue: (v: RobtopLevel | null) => {
    resultMock.mockResolvedValue(
      v ? { status: 'found', level: v } : { status: 'not_found' }
    )
    return robtopMock
  },
  mockResolvedValueOnce: (v: RobtopLevel | null) => {
    resultMock.mockResolvedValueOnce(
      v ? { status: 'found', level: v } : { status: 'not_found' }
    )
    return robtopMock
  },
  mockRejectedValueOnce: (e: unknown) => {
    resultMock.mockRejectedValueOnce(e)
    return robtopMock
  },
  get mock() {
    return resultMock.mock
  },
}

// A full RobtopLevel with only the diff-relevant fields worth setting; the rest
// default to null/false (the sync core never reads them).
function makeRobtop(overrides: Partial<RobtopLevel> = {}): RobtopLevel {
  return {
    name: 'Cached Name',
    creator: 'Cached Creator',
    inGameDifficulty: 'Insane Demon',
    length: null,
    songName: 'Cached Song',
    songAuthor: 'Cached Author',
    isRated: true,
    isDemon: true,
    platformer: false,
    description: null,
    creatorPlayerId: null,
    creatorAccountId: null,
    stars: null,
    starsRequested: null,
    partialDiff: null,
    downloads: null,
    likes: null,
    disliked: null,
    objectCount: null,
    coins: null,
    coinsVerified: null,
    featured: null,
    featureScore: null,
    epicValue: null,
    twoPlayer: null,
    lowDetailMode: null,
    copiedFromId: null,
    levelVersion: null,
    gameVersion: null,
    officialSongId: null,
    songId: null,
    songLink: null,
    songSize: null,
    ...overrides,
  }
}

// Seed a level row with the diff-relevant fields set to the "cached" values.
async function seedCachedLevel(overrides: Record<string, unknown> = {}) {
  return prisma.level.create({
    data: {
      inGameId: '100',
      name: 'Cached Name',
      creator: 'Cached Creator',
      inGameDifficulty: 'Insane Demon',
      songName: 'Cached Song',
      songAuthor: 'Cached Author',
      isRated: true,
      isDemon: true,
      dataSource: 'robtop_autofill',
      verified: true,
      ...overrides,
    },
  })
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

beforeEach(async () => {
  await truncateAll(prisma)
  // The round-robin cursor lives outside truncateAll's table list; reset it so
  // each test starts a fresh rotation.
  await prisma.levelSyncCursor.deleteMany({})
  robtopMock.mockReset()
  sfhMock.mockReset()
  captureMessageMock.mockClear()
  // Default: SFH reports no NONG (checked, none). SFH-specific tests override.
  sfhMock.mockResolvedValue(null)
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── shared core: diff/write behavior ──────────────────────────────────────────

describe('syncLevelBatch — found, no diff', () => {
  it('updates only last_checked_at when nothing changed', async () => {
    await seedCachedLevel()
    robtopMock.mockResolvedValue(makeRobtop())

    const before = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.lastCheckedAt).not.toBeNull()
    expect(after.name).toBe('Cached Name')
    expect(after.creator).toBe('Cached Creator')
    expect(after.inGameDifficulty).toBe('Insane Demon')
    expect(after.isRated).toBe(true)
    expect(after.ratingStatusSince).toBeNull()
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime()
    )
    expect(result).toMatchObject({
      processed: 1,
      updated: 0,
      ratingChanged: 0,
      delisted: 0,
      errors: 0,
    })
  })
})

describe('syncLevelBatch — found, metadata diff', () => {
  it('overwrites name/creator/song directly without stamping rating_status_since', async () => {
    await seedCachedLevel()
    robtopMock.mockResolvedValue(
      makeRobtop({
        name: 'New Name',
        creator: 'New Creator',
        songName: 'New Song',
        songAuthor: 'New Author',
      })
    )

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.name).toBe('New Name')
    expect(after.creator).toBe('New Creator')
    expect(after.songName).toBe('New Song')
    expect(after.songAuthor).toBe('New Author')
    // Rating status untouched — metadata diffs don't drive the volatile window.
    expect(after.ratingStatusSince).toBeNull()
    expect(after.lastCheckedAt).not.toBeNull()
    expect(result).toMatchObject({ processed: 1, updated: 1, ratingChanged: 0 })
  })
})

describe('syncLevelBatch — found, rating diff', () => {
  it('stamps rating_status_since when is_rated flips', async () => {
    await seedCachedLevel({
      isRated: false,
      inGameDifficulty: 'Unrated',
      ratingStatusSince: null,
    })
    robtopMock.mockResolvedValue(
      makeRobtop({ isRated: true, inGameDifficulty: 'Insane Demon' })
    )

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.isRated).toBe(true)
    expect(after.inGameDifficulty).toBe('Insane Demon')
    expect(after.ratingStatusSince).not.toBeNull()
    expect(result).toMatchObject({ processed: 1, updated: 1, ratingChanged: 1 })
  })

  it('stamps rating_status_since when in_game_difficulty changes', async () => {
    await seedCachedLevel({
      inGameDifficulty: 'Hard Demon',
      ratingStatusSince: daysAgo(200),
    })
    robtopMock.mockResolvedValue(
      makeRobtop({ inGameDifficulty: 'Extreme Demon' })
    )

    await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.inGameDifficulty).toBe('Extreme Demon')
    // Re-stamped to ~now (well after the seeded 200-days-ago value).
    expect(after.ratingStatusSince!.getTime()).toBeGreaterThan(
      daysAgo(1).getTime()
    )
  })
})

describe('syncLevelBatch — confirm-before-delist', () => {
  it('first not-found stamps missingSince and does NOT delist', async () => {
    // Regression guard for the Aug 2026 incident: a single not-found (which
    // RobTop also returns under load) must never delist a live level.
    await seedCachedLevel({ ratingStatusSince: daysAgo(3) }) // missingSince null
    robtopMock.mockResolvedValue(null) // not_found

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.delistedAt).toBeNull()
    expect(after.missingSince).not.toBeNull()
    // Metadata untouched.
    expect(after.name).toBe('Cached Name')
    expect(result).toMatchObject({ processed: 1, delisted: 0, missing: 1 })
  })

  it('delists only once the level has stayed missing past the confirmation window', async () => {
    // Already missing longer than the window → this not-found confirms it.
    await seedCachedLevel({
      missingSince: daysAgo(2),
      ratingStatusSince: daysAgo(3),
    })
    robtopMock.mockResolvedValue(null)

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.delistedAt).not.toBeNull()
    // Metadata frozen at last-known values; rating_status_since not re-stamped.
    expect(after.name).toBe('Cached Name')
    expect(after.isRated).toBe(true)
    expect(after.ratingStatusSince!.getTime()).toBeLessThan(
      daysAgo(1).getTime()
    )
    expect(result).toMatchObject({ processed: 1, delisted: 1, missing: 0 })
  })

  it('keeps waiting (no delist) while still inside the window', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    await seedCachedLevel({ missingSince: oneHourAgo })
    robtopMock.mockResolvedValue(null)

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.delistedAt).toBeNull()
    expect(after.missingSince).not.toBeNull()
    expect(result).toMatchObject({ delisted: 0, missing: 1 })
  })

  it('clears missingSince when a previously-missing level reappears', async () => {
    await seedCachedLevel({ missingSince: daysAgo(2) })
    robtopMock.mockResolvedValue(makeRobtop()) // found

    await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.missingSince).toBeNull()
    expect(after.delistedAt).toBeNull()
  })
})

describe('syncLevelBatch — unreachable (must NOT delist)', () => {
  it('leaves the row untouched on a transient RobTop failure', async () => {
    // Regression guard: a transient RobTop failure (rate-limit/Cloudflare/
    // network) must never be mistaken for a not-found and delist a live level.
    await seedCachedLevel({ ratingStatusSince: daysAgo(3) })
    resultMock.mockResolvedValue({ status: 'unreachable' })

    const result = await syncLevelBatch(['100'])

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.delistedAt).toBeNull()
    // Row left entirely untouched — not even last_checked_at is stamped.
    expect(after.lastCheckedAt).toBeNull()
    expect(result).toMatchObject({
      processed: 1,
      updated: 0,
      delisted: 0,
      unreachable: 1,
      errors: 0,
    })
  })
})

describe('syncLevelBatch — circuit breaker', () => {
  it('aborts the batch after a run of consecutive failures and alerts', async () => {
    // The Aug 2026 incident: once RobTop starts 429ing, every request fails.
    // The breaker must stop the batch instead of delisting the whole tail.
    const ids = await seedN(10)
    resultMock.mockResolvedValue({ status: 'unreachable' })

    const result = await syncLevelBatch(ids, 0)

    // Stopped at the streak threshold (5), not the full batch of 10.
    expect(result.aborted).toBe(true)
    expect(result.processed).toBe(5)
    expect(result.unreachable).toBe(5)
    // The untouched tail keeps its state — nothing delisted.
    const delistedCount = await prisma.level.count({
      where: { delistedAt: { not: null } },
    })
    expect(delistedCount).toBe(0)
    // Paged, not silent.
    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(captureMessageMock.mock.calls[0]?.[1]).toBe('error')
  })

  it('resets the streak on a success so a healthy batch is not aborted', async () => {
    const ids = await seedN(9)
    // 4 unreachable, one live level (resets the streak), then 4 more.
    resultMock
      .mockResolvedValueOnce({ status: 'unreachable' })
      .mockResolvedValueOnce({ status: 'unreachable' })
      .mockResolvedValueOnce({ status: 'unreachable' })
      .mockResolvedValueOnce({ status: 'unreachable' })
      .mockResolvedValueOnce({ status: 'found', level: makeRobtop() })
      .mockResolvedValueOnce({ status: 'unreachable' })
      .mockResolvedValueOnce({ status: 'unreachable' })
      .mockResolvedValueOnce({ status: 'unreachable' })
      .mockResolvedValueOnce({ status: 'unreachable' })

    const result = await syncLevelBatch(ids, 0)

    expect(result.aborted).toBe(false)
    expect(result.processed).toBe(9)
    expect(result.unreachable).toBe(8)
    expect(captureMessageMock).not.toHaveBeenCalled()
  })

  it('alerts when a run mass-delists even without a consecutive streak', async () => {
    // 10 delisted, but never 5 in a row (a live level between each pair keeps the
    // streak short), so only the mass-delist alarm fires — not the breaker.
    const ids = await seedN(20)
    // All already missing past the confirmation window, so a not-found delists
    // immediately rather than just stamping missingSince.
    await prisma.level.updateMany({
      where: { inGameId: { in: ids } },
      data: { missingSince: daysAgo(2) },
    })
    for (let i = 0; i < ids.length; i++) {
      resultMock.mockResolvedValueOnce(
        i % 2 === 0
          ? { status: 'not_found' }
          : { status: 'found', level: makeRobtop() }
      )
    }

    const result = await syncLevelBatch(ids, 0)

    expect(result.aborted).toBe(false)
    expect(result.delisted).toBe(10)
    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    expect(captureMessageMock.mock.calls[0]?.[0]).toContain('mass delist')
  })
})

describe('syncLevelBatch — resilience', () => {
  it('counts a per-level failure and continues the batch', async () => {
    await seedCachedLevel({ inGameId: '100' })
    await seedCachedLevel({ inGameId: '200' })
    robtopMock
      .mockRejectedValueOnce(new Error('RobTop exploded'))
      .mockResolvedValueOnce(makeRobtop({ name: 'Second' }))

    const result = await syncLevelBatch(['100', '200'], 0)

    expect(result.errors).toBe(1)
    const second = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '200' },
    })
    expect(second.name).toBe('Second')
  })
})

// ─── round-robin slice: selection, cursor advancement, wrap ─────────────────────

describe('runLevelSyncSlice — eligibility', () => {
  it('syncs cached non-delisted non-official levels; skips delisted and official', async () => {
    await seedCachedLevel({ inGameId: 'a-normal' })
    await seedCachedLevel({ inGameId: 'b-delisted', delistedAt: new Date() })
    await seedCachedLevel({ inGameId: 'c-official', dataSource: 'official' })
    robtopMock.mockResolvedValue(makeRobtop())

    const result = await runLevelSyncSlice(10)

    const seen = robtopMock.mock.calls.map((c) => c[0]).sort()
    expect(seen).toEqual(['a-normal'])
    expect(result.processed).toBe(1)
  })
})

describe('runLevelSyncSlice — round-robin', () => {
  it('processes a bounded slice and advances the cursor across runs, wrapping at the end', async () => {
    // Lexicographic order: 'r-1' < 'r-2' < 'r-3'.
    await seedCachedLevel({ inGameId: 'r-1' })
    await seedCachedLevel({ inGameId: 'r-2' })
    await seedCachedLevel({ inGameId: 'r-3' })
    robtopMock.mockResolvedValue(makeRobtop())

    // Run 1: first two, cursor → 'r-2'.
    await runLevelSyncSlice(2)
    expect(robtopMock.mock.calls.map((c) => c[0])).toEqual(['r-1', 'r-2'])
    expect(await readCursor()).toBe('r-2')

    // Run 2: the remaining one after the cursor, cursor → 'r-3'.
    robtopMock.mockClear()
    await runLevelSyncSlice(2)
    expect(robtopMock.mock.calls.map((c) => c[0])).toEqual(['r-3'])
    expect(await readCursor()).toBe('r-3')

    // Run 3: cursor is past the end → wrap to the start, cursor → 'r-2' again.
    robtopMock.mockClear()
    await runLevelSyncSlice(2)
    expect(robtopMock.mock.calls.map((c) => c[0])).toEqual(['r-1', 'r-2'])
    expect(await readCursor()).toBe('r-2')
  })
})

describe('runLevelSyncSlice — cursor advances past a failing stretch', () => {
  it('advances to the end of the slice even when the circuit breaker aborts', async () => {
    // 8 levels, all unreachable → breaker aborts after 5. The cursor must still
    // jump to the last id of the slice so the failing prefix can't pin the
    // rotation and starve everything after it.
    const ids = await seedN(8) // 'id-1'..'id-8', lexicographically ordered
    resultMock.mockResolvedValue({ status: 'unreachable' })

    const result = await runLevelSyncSlice(8)

    expect(result.aborted).toBe(true)
    expect(result.processed).toBe(5)
    expect(await readCursor()).toBe(ids[ids.length - 1])
  })
})

describe('runDelistedReverifySlice', () => {
  it('un-delists a delisted level that reappears on RobTop, and clears missingSince', async () => {
    await seedCachedLevel({
      inGameId: 'back',
      delistedAt: new Date(),
      missingSince: daysAgo(5),
    })
    resultMock.mockResolvedValue({ status: 'found', level: makeRobtop() })

    const result = await runDelistedReverifySlice(10)

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: 'back' },
    })
    expect(after.delistedAt).toBeNull()
    expect(after.missingSince).toBeNull()
    expect(result).toMatchObject({ processed: 1, restored: 1, stillGone: 0 })
  })

  it('leaves a still-gone level delisted, and never touches non-delisted or official rows', async () => {
    await seedCachedLevel({ inGameId: 'gone', delistedAt: new Date() })
    await seedCachedLevel({ inGameId: 'live' }) // not delisted
    await seedCachedLevel({
      inGameId: 'off',
      delistedAt: new Date(),
      dataSource: 'official',
    })
    resultMock.mockResolvedValue({ status: 'not_found' })

    const result = await runDelistedReverifySlice(10)

    // Only the non-official delisted row is re-checked.
    expect(resultMock.mock.calls.map((c) => c[0])).toEqual(['gone'])
    const gone = await prisma.level.findUniqueOrThrow({
      where: { inGameId: 'gone' },
    })
    expect(gone.delistedAt).not.toBeNull()
    expect(result).toMatchObject({ processed: 1, restored: 0, stillGone: 1 })
  })

  it('advances its own cursor without disturbing the main sweep cursor', async () => {
    await seedCachedLevel({ inGameId: 'd-1', delistedAt: new Date() })
    await seedCachedLevel({ inGameId: 'd-2', delistedAt: new Date() })
    resultMock.mockResolvedValue({ status: 'not_found' })

    await runDelistedReverifySlice(1)

    expect(await readCursor('reverify')).toBe('d-1')
    // The main-sweep cursor is untouched.
    expect(await readCursor('singleton')).toBeNull()
  })
})

// ─── Song File Hub NONG check (piggybacked on the batch) ────────────────────────

const SFH_RESULT = {
  sfhId: '64f54c6ceba5efcdadf78b01',
  sfhSongName: 'CRIM3S - Lost (XVA Remix)',
  sfhYoutubeUrl: 'https://youtu.be/UWNvLgl0M60',
  sfhYoutubeVideoId: 'YrTauLnDVdw',
  sfhDownloadUrl: 'https://api.songfilehub.com/song/abc?download=true',
  sfhFileType: 'mp3',
  sfhDownloads: 1767103,
}

describe('syncLevelBatch — Song File Hub check', () => {
  it('checks a fresh eligible level and persists a found NONG', async () => {
    await seedCachedLevel() // sfhCheckedAt null, isNong false, not delisted
    robtopMock.mockResolvedValue(makeRobtop()) // isRated: true
    sfhMock.mockResolvedValue(SFH_RESULT)

    const result = await syncLevelBatch(['100'], 0)

    // Rated level → rated SFH catalog.
    expect(sfhMock).toHaveBeenCalledWith('100', 'rated')
    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.isNong).toBe(true)
    expect(after.sfhCheckedAt).not.toBeNull()
    expect(after.sfhId).toBe('64f54c6ceba5efcdadf78b01')
    expect(after.sfhDownloads).toBe(1767103)
    expect(result.sfhChecked).toBe(1)
    expect(result.sfhFound).toBe(1)
  })

  it('checks the unrated catalog when the level syncs as unrated', async () => {
    await seedCachedLevel({ isRated: false, inGameDifficulty: 'Unrated' })
    robtopMock.mockResolvedValue(
      makeRobtop({ isRated: false, inGameDifficulty: 'Unrated' })
    )
    sfhMock.mockResolvedValue(SFH_RESULT)

    await syncLevelBatch(['100'], 0)

    // Unrated level → unrated SFH catalog.
    expect(sfhMock).toHaveBeenCalledWith('100', 'unrated')
    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.isNong).toBe(true)
  })

  it('stamps sfhCheckedAt (isNong false) when SFH reports no NONG', async () => {
    await seedCachedLevel()
    robtopMock.mockResolvedValue(makeRobtop())
    sfhMock.mockResolvedValue(null)

    const result = await syncLevelBatch(['100'], 0)

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.isNong).toBe(false)
    expect(after.sfhCheckedAt).not.toBeNull()
    expect(result.sfhChecked).toBe(1)
    expect(result.sfhFound).toBe(0)
  })

  it('leaves sfhCheckedAt null on an SFH failure so a later run retries', async () => {
    await seedCachedLevel()
    robtopMock.mockResolvedValue(makeRobtop())
    sfhMock.mockResolvedValue(undefined) // failure

    const result = await syncLevelBatch(['100'], 0)

    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.sfhCheckedAt).toBeNull()
    expect(after.isNong).toBe(false)
    expect(result.sfhChecked).toBe(1)
    expect(result.sfhFound).toBe(0)
  })

  it('skips a level checked within the re-check window', async () => {
    await seedCachedLevel({ sfhCheckedAt: daysAgo(30) })
    robtopMock.mockResolvedValue(makeRobtop())

    const result = await syncLevelBatch(['100'], 0)

    expect(sfhMock).not.toHaveBeenCalled()
    expect(result.sfhChecked).toBe(0)
  })

  it('re-checks a level last checked longer ago than the re-check window', async () => {
    await seedCachedLevel({ sfhCheckedAt: daysAgo(200) })
    robtopMock.mockResolvedValue(makeRobtop())
    sfhMock.mockResolvedValue(SFH_RESULT)

    const result = await syncLevelBatch(['100'], 0)

    expect(sfhMock).toHaveBeenCalledWith('100', 'rated')
    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.isNong).toBe(true)
    expect(result.sfhChecked).toBe(1)
    expect(result.sfhFound).toBe(1)
  })

  it('skips the SFH check for a level delisted in this same run', async () => {
    // Already missing past the window, so this not-found confirms the delist.
    await seedCachedLevel({ missingSince: daysAgo(2) })
    robtopMock.mockResolvedValue(null)

    const result = await syncLevelBatch(['100'], 0)

    expect(sfhMock).not.toHaveBeenCalled()
    expect(result.delisted).toBe(1)
    expect(result.sfhChecked).toBe(0)
    const after = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '100' },
    })
    expect(after.sfhCheckedAt).toBeNull()
  })
})
