import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../test/utils'

// Real DB; mock ONLY the external RobTop HTTP client.
vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../utils/robtop', () => ({
  fetchRobtopLevel: vi.fn(),
  // The /page endpoint resolves via findOrResolveLevel, which uses the
  // distinction-preserving variant.
  fetchRobtopLevelResult: vi.fn(),
}))
vi.mock('../utils/gddl', () => ({ fetchGddlTier: vi.fn() }))
// Mock only the SFH HTTP client — checkSfhNongIfDue + the cache write run for
// real against the test DB.
vi.mock('../utils/songFileHub', () => ({ fetchSongFileHubNong: vi.fn() }))

const { default: levelsApp } = await import('./levels')
const { fetchRobtopLevel, fetchRobtopLevelResult } = await import(
  '../utils/robtop'
)
const { fetchGddlTier } = await import('../utils/gddl')
const { fetchSongFileHubNong } = await import('../utils/songFileHub')

const prisma = getTestPrisma()
const robtopMock = fetchRobtopLevel as unknown as ReturnType<typeof vi.fn>
const robtopResultMock = fetchRobtopLevelResult as unknown as ReturnType<
  typeof vi.fn
>
const gddlTierMock = fetchGddlTier as unknown as ReturnType<typeof vi.fn>
const sfhMock = fetchSongFileHubNong as unknown as ReturnType<typeof vi.fn>

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

beforeEach(async () => {
  vi.clearAllMocks()
  // Default: GDDL has no suggested tier. Individual tests override.
  gddlTierMock.mockResolvedValue(null)
  // Default: SFH unavailable (no NONG write) so unrelated tests are unaffected.
  sfhMock.mockResolvedValue(undefined)
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /levels/:levelId/resolve', () => {
  it('returns the cached level without calling RobTop on a cache hit', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '111', name: 'Cached Level' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/111/resolve'
    )
    const body = (await res.json()) as {
      level: { inGameId: string; name: string } | null
      fallbackToManual: boolean
      existingCompletion: unknown
    }

    expect(res.status).toBe(200)
    expect(body.fallbackToManual).toBe(false)
    expect(body.level?.inGameId).toBe('111')
    expect(body.level?.name).toBe('Cached Level')
    expect(body.existingCompletion).toBeNull()
    expect(robtopMock).not.toHaveBeenCalled()
  })

  it('calls RobTop once on a cache miss, caches it (incl. isDemon), and autofills the GDDL tier', async () => {
    const user = await seedUser(prisma)
    robtopMock.mockResolvedValue({
      name: 'Fetched Level',
      creator: 'RobTop',
      inGameDifficulty: 'Extreme Demon',
      length: 'Long',
      songName: 'Song',
      songAuthor: 'Author',
      isRated: true,
      isDemon: true,
    })
    gddlTierMock.mockResolvedValue(35)

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/222/resolve'
    )
    const body = (await res.json()) as {
      level: {
        inGameId: string
        dataSource: string
        verified: boolean
        isDemon: boolean
      } | null
      fallbackToManual: boolean
      suggestedGddlTier: number | null
    }

    expect(res.status).toBe(200)
    expect(robtopMock).toHaveBeenCalledTimes(1)
    expect(robtopMock).toHaveBeenCalledWith('222')
    expect(body.fallbackToManual).toBe(false)
    expect(body.level?.dataSource).toBe('robtop_autofill')
    expect(body.level?.verified).toBe(true)
    expect(body.level?.isDemon).toBe(true)
    // GDDL suggested tier is fetched for rated levels and folded into resolve.
    expect(gddlTierMock).toHaveBeenCalledWith('222')
    expect(body.suggestedGddlTier).toBe(35)

    // The level was persisted to the cache.
    const cached = await prisma.level.findUnique({ where: { inGameId: '222' } })
    expect(cached?.name).toBe('Fetched Level')
    expect(cached?.inGameDifficulty).toBe('Extreme Demon')
    expect(cached?.isDemon).toBe(true)
  })

  it('skips the GDDL tier lookup for unrated levels', async () => {
    const user = await seedUser(prisma)
    // seedLevel defaults isRated=false.
    await seedLevel(prisma, { inGameId: '556' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/556/resolve'
    )
    const body = (await res.json()) as { suggestedGddlTier: number | null }

    expect(res.status).toBe(200)
    expect(gddlTierMock).not.toHaveBeenCalled()
    expect(body.suggestedGddlTier).toBeNull()
  })

  it('returns the manual-fallback signal (200, not 500) when RobTop is down', async () => {
    const user = await seedUser(prisma)
    robtopMock.mockResolvedValue(null)

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/333/resolve'
    )
    const body = (await res.json()) as {
      level: unknown
      fallbackToManual: boolean
    }

    expect(res.status).toBe(200)
    expect(body.level).toBeNull()
    expect(body.fallbackToManual).toBe(true)
    // Nothing was written to the cache.
    expect(
      await prisma.level.findUnique({ where: { inGameId: '333' } })
    ).toBeNull()
  })

  it('includes the existing completion when the user already completed the level', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '444' })
    const lp = await prisma.levelProgress.create({
      data: { userId: user.id, levelId: '444', status: 'COMPLETED' },
    })
    await prisma.progressUpdate.create({
      data: {
        levelProgressId: lp.id,
        kind: 'COMPLETION',
        attempts: 5000,
        enjoyment: 80,
      },
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/444/resolve'
    )
    const body = (await res.json()) as {
      existingCompletion: { attempts: number; enjoyment: number } | null
    }

    expect(res.status).toBe(200)
    expect(body.existingCompletion).not.toBeNull()
    expect(body.existingCompletion?.attempts).toBe(5000)
    expect(body.existingCompletion?.enjoyment).toBe(80)
  })

  // ─── Song File Hub NONG check ──────────────────────────────────────────────

  const SFH_RESULT = {
    sfhId: '64f54c6ceba5efcdadf78b01',
    sfhSongName: 'CRIM3S - Lost (XVA Remix)',
    sfhYoutubeUrl: 'https://youtu.be/UWNvLgl0M60',
    sfhYoutubeVideoId: 'YrTauLnDVdw',
    sfhDownloadUrl: 'https://api.songfilehub.com/song/abc?download=true',
    sfhFileType: 'mp3',
    sfhDownloads: 1767103,
  }

  it('checks the rated SFH catalog for a rated level and persists a found NONG', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '600', isRated: true })
    sfhMock.mockResolvedValue(SFH_RESULT)

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/600/resolve'
    )
    expect(res.status).toBe(200)
    expect(sfhMock).toHaveBeenCalledWith('600', 'rated')

    const cached = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '600' },
    })
    expect(cached.isNong).toBe(true)
    expect(cached.sfhCheckedAt).not.toBeNull()
    expect(cached.sfhId).toBe('64f54c6ceba5efcdadf78b01')
    expect(cached.sfhSongName).toBe('CRIM3S - Lost (XVA Remix)')
    expect(cached.sfhDownloads).toBe(1767103)
  })

  it('checks SFH on a cache-miss level freshly created from RobTop', async () => {
    const user = await seedUser(prisma)
    robtopMock.mockResolvedValue({
      name: 'Fresh Level',
      creator: 'RobTop',
      inGameDifficulty: 'Extreme Demon',
      length: 'Long',
      songName: 'Placeholder',
      songAuthor: 'Author',
      isRated: true,
      isDemon: true,
    })
    sfhMock.mockResolvedValue(SFH_RESULT)

    await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/700/resolve'
    )

    // Rated RobTop level → rated SFH catalog, on the row just created.
    expect(sfhMock).toHaveBeenCalledWith('700', 'rated')
    const cached = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '700' },
    })
    expect(cached.isNong).toBe(true)
    expect(cached.sfhCheckedAt).not.toBeNull()
    expect(cached.sfhSongName).toBe('CRIM3S - Lost (XVA Remix)')
  })

  it('checks the unrated SFH catalog for an unrated level', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '605', isRated: false })
    sfhMock.mockResolvedValue(SFH_RESULT)

    await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/605/resolve'
    )

    expect(sfhMock).toHaveBeenCalledWith('605', 'unrated')
    const cached = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '605' },
    })
    expect(cached.isNong).toBe(true)
  })

  it('stamps sfhCheckedAt (isNong false) when SFH reports no NONG', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '601' })
    sfhMock.mockResolvedValue(null)

    await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/601/resolve'
    )

    const cached = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '601' },
    })
    expect(cached.isNong).toBe(false)
    expect(cached.sfhCheckedAt).not.toBeNull()
    expect(cached.sfhId).toBeNull()
  })

  it('returns cached SFH NONG fields in the resolve payload (and omits sfhCheckedAt)', async () => {
    const user = await seedUser(prisma)
    await prisma.level.create({
      data: {
        inGameId: '610',
        dataSource: 'robtop_autofill',
        verified: true,
        isRated: true,
        isNong: true,
        sfhCheckedAt: daysAgo(30), // recent → no re-check this request
        sfhId: '64f54c6ceba5efcdadf78b01',
        sfhSongName: 'CRIM3S - Lost (XVA Remix)',
        sfhYoutubeUrl: 'https://youtu.be/UWNvLgl0M60',
        sfhYoutubeVideoId: 'YrTauLnDVdw',
        sfhDownloadUrl: 'https://api.songfilehub.com/song/abc?download=true',
        sfhFileType: 'mp3',
        sfhDownloads: 1767103,
      },
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/610/resolve'
    )
    const body = (await res.json()) as {
      level: Record<string, unknown> | null
    }

    expect(res.status).toBe(200)
    expect(sfhMock).not.toHaveBeenCalled() // within the re-check window
    expect(body.level?.isNong).toBe(true)
    expect(body.level?.sfhSongName).toBe('CRIM3S - Lost (XVA Remix)')
    expect(body.level?.sfhYoutubeVideoId).toBe('YrTauLnDVdw')
    expect(body.level?.sfhDownloadUrl).toBe(
      'https://api.songfilehub.com/song/abc?download=true'
    )
    expect(body.level?.sfhDownloads).toBe(1767103)
    // Internal bookkeeping field stays off the wire.
    expect(body.level).not.toHaveProperty('sfhCheckedAt')
  })

  it('does not re-check a level checked within the re-check window', async () => {
    const user = await seedUser(prisma)
    // Found recently — still inside the 6-month window, so no re-query.
    await seedLevel(prisma, {
      inGameId: '602',
      isNong: true,
      sfhCheckedAt: daysAgo(30),
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/602/resolve'
    )
    expect(res.status).toBe(200)
    expect(sfhMock).not.toHaveBeenCalled()
  })

  it('re-checks a level last checked longer ago than the re-check window', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, {
      inGameId: '603',
      isRated: false,
      isNong: false,
      sfhCheckedAt: daysAgo(200),
    })
    sfhMock.mockResolvedValue(SFH_RESULT)

    await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/603/resolve'
    )

    expect(sfhMock).toHaveBeenCalledWith('603', 'unrated')
    const cached = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '603' },
    })
    expect(cached.isNong).toBe(true)
  })

  it('does not fail the resolve (no 500) and writes nothing when SFH is down', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '604' })
    sfhMock.mockResolvedValue(undefined) // SFH failure signal

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/604/resolve'
    )
    expect(res.status).toBe(200)
    expect(sfhMock).toHaveBeenCalledWith('604', 'unrated')

    const cached = await prisma.level.findUniqueOrThrow({
      where: { inGameId: '604' },
    })
    // Left unchecked so a later run retries.
    expect(cached.sfhCheckedAt).toBeNull()
    expect(cached.isNong).toBe(false)
  })
})

describe('GET /levels/:levelId/page', () => {
  it('returns a cached level with hasUserProgress=false and no RobTop call', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '810', name: 'Page Level' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/810/page'
    )
    const body = (await res.json()) as {
      data: Record<string, unknown>
    }

    expect(res.status).toBe(200)
    expect(body.data.inGameId).toBe('810')
    expect(body.data.name).toBe('Page Level')
    expect(body.data.hasUserProgress).toBe(false)
    // Page-only fields that the logging wire shape omits.
    expect(body.data).toHaveProperty('delistedAt')
    expect(body.data).toHaveProperty('lastCheckedAt')
    expect(robtopResultMock).not.toHaveBeenCalled()
  })

  it('reports hasUserProgress=true for any LevelProgress row (existence only)', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '811' })
    // A non-completed row still counts — the cross-link condition is any row.
    await prisma.levelProgress.create({
      data: { userId: user.id, levelId: '811', status: 'IN_PROGRESS' },
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/811/page'
    )
    const body = (await res.json()) as { data: { hasUserProgress: boolean } }

    expect(res.status).toBe(200)
    expect(body.data.hasUserProgress).toBe(true)
  })

  it('resolves an uncached level from RobTop, caches it, and returns it', async () => {
    const user = await seedUser(prisma)
    robtopResultMock.mockResolvedValue({
      status: 'found',
      level: {
        name: 'Resolved Page Level',
        creator: 'RobTop',
        inGameDifficulty: 'Extreme Demon',
        length: 'Long',
        songName: 'Song',
        songAuthor: 'Author',
        isRated: true,
        isDemon: true,
        platformer: false,
      },
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/812/page'
    )
    const body = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(robtopResultMock).toHaveBeenCalledWith('812')
    expect(body.data.name).toBe('Resolved Page Level')
    expect(body.data.dataSource).toBe('robtop_autofill')
    expect(body.data.hasUserProgress).toBe(false)

    const cached = await prisma.level.findUnique({ where: { inGameId: '812' } })
    expect(cached?.name).toBe('Resolved Page Level')
  })

  it('returns 404 with reason=not_found when GD has no such level', async () => {
    const user = await seedUser(prisma)
    robtopResultMock.mockResolvedValue({ status: 'not_found' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/813/page'
    )
    const body = (await res.json()) as { reason?: string }

    expect(res.status).toBe(404)
    expect(body.reason).toBe('not_found')
    // Nothing cached — a later visit re-resolves.
    const cached = await prisma.level.findUnique({ where: { inGameId: '813' } })
    expect(cached).toBeNull()
  })

  it('returns 503 with reason=unreachable when GD cannot be reached', async () => {
    const user = await seedUser(prisma)
    robtopResultMock.mockResolvedValue({ status: 'unreachable' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/814/page'
    )
    const body = (await res.json()) as { reason?: string; retryable?: boolean }

    expect(res.status).toBe(503)
    expect(body.reason).toBe('unreachable')
    expect(body.retryable).toBe(true)
    const cached = await prisma.level.findUnique({ where: { inGameId: '814' } })
    expect(cached).toBeNull()
  })
})

describe('POST /levels (manual metadata write)', () => {
  it('creates a manual level with verified=false and the user difficulty as in-game difficulty', async () => {
    const user = await seedUser(prisma)

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inGameId: '555',
          name: 'Manual Level',
          creator: 'Some Creator',
          difficulty: 'Hard Demon',
          isDemon: true,
          songName: 'Manual Song',
          songAuthor: 'Manual Author',
          length: 'XL',
        }),
      }
    )

    expect(res.status).toBe(201)
    const created = await prisma.level.findUnique({
      where: { inGameId: '555' },
    })
    expect(created?.dataSource).toBe('manual')
    expect(created?.verified).toBe(false)
    // The sanctioned exception: user difficulty BECOMES the in-game difficulty.
    expect(created?.inGameDifficulty).toBe('Hard Demon')
    expect(created?.length).toBe('XL')
    expect(created?.isDemon).toBe(true)
  })
})

describe('GET /levels/search (pg_trgm)', () => {
  it('tolerates a typo and finds the matching level via the trgm index', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '1', name: 'Cataclysm' })
    await seedLevel(prisma, { inGameId: '2', name: 'Deadlocked' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/search?q=Cataclism' // note the typo
    )
    const body = (await res.json()) as {
      data: Array<{ inGameId: string; name: string }>
    }

    expect(res.status).toBe(200)
    expect(body.data.some((r) => r.name === 'Cataclysm')).toBe(true)
  })

  it('returns an empty array on a cold cache (no matches)', async () => {
    const user = await seedUser(prisma)

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/search?q=somethingnobodyhas'
    )
    const body = (await res.json()) as { data: unknown[] }

    expect(res.status).toBe(200)
    expect(body.data).toEqual([])
  })
})
