import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../../test/utils'

// Real DB; mock ONLY the external RobTop HTTP client.
vi.mock('../../utils/prisma', async () => {
  const { getTestPrisma } = await import('../../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../../utils/robtop', () => ({
  fetchRobtopLevel: vi.fn(),
  // The /page endpoint resolves via findOrResolveLevel, which uses the
  // distinction-preserving variant.
  fetchRobtopLevelResult: vi.fn(),
  // /gd-search runs the GD-server name search via runGdSearch.
  searchRobtopByNameResult: vi.fn(),
}))
vi.mock('../../utils/gddl', async (importOriginal) => ({
  // Spread the real module: communitySync reaches fetchGddlLevel and
  // roundGddlTier through this route, and a bare factory would shadow them
  // away with a missing-export error.
  ...(await importOriginal<typeof import('../../utils/gddl')>()),
  fetchGddlTier: vi.fn(),
  fetchGddlLevel: vi.fn(async () => null),
}))
// Mock only the SFH HTTP client — checkSfhNongIfDue + the cache write run for
// real against the test DB.
vi.mock('../../utils/songFileHub', () => ({ fetchSongFileHubNong: vi.fn() }))
vi.mock('../../utils/globalStatsViewer', () => ({
  fetchGlobalStatsViewerLevel: vi.fn(async () => null),
}))
vi.mock('../../utils/aredl', () => ({
  fetchAredlLevel: vi.fn(async () => null),
  fetchAredlList: vi.fn(async () => undefined),
}))

const { default: levelsApp } = await import('./index')
const { searchRobtopByNameResult } = await import('../../utils/robtop')
const { fetchGddlTier } = await import('../../utils/gddl')
const { fetchSongFileHubNong } = await import('../../utils/songFileHub')

const prisma = getTestPrisma()
const gddlTierMock = fetchGddlTier as unknown as ReturnType<typeof vi.fn>
const sfhMock = fetchSongFileHubNong as unknown as ReturnType<typeof vi.fn>
const gdSearchMock = searchRobtopByNameResult as unknown as ReturnType<
  typeof vi.fn
>

// A minimal RobtopLevel for GD-search results. Only the fields the row shape
// and buildRobtopCreateData read need realistic values; the rest default null.
function makeRobtopLevel(over: {
  name: string
  isRated: boolean
  inGameDifficulty?: string | null
  stars?: number | null
}) {
  return {
    name: over.name,
    creator: 'Someone',
    inGameDifficulty:
      over.inGameDifficulty ?? (over.isRated ? 'Insane Demon' : null),
    length: 'Long',
    songName: 'Song',
    songAuthor: 'Artist',
    isRated: over.isRated,
    isDemon: over.isRated,
    platformer: false,
    description: null,
    creatorPlayerId: null,
    creatorAccountId: null,
    stars: over.stars ?? (over.isRated ? 10 : null),
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
  }
}

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
describe('GET /levels/gd-search (escalation)', () => {
  it('dedupes cached levels, partitions rated/unrated, and seeds only rated', async () => {
    const user = await seedUser(prisma)
    // '100' is already cached → must be omitted from the GD results.
    await seedLevel(prisma, { inGameId: '100', name: 'Bloodbath' })

    gdSearchMock.mockResolvedValue({
      status: 'ok',
      results: [
        {
          levelId: '100',
          level: makeRobtopLevel({ name: 'Bloodbath', isRated: true }),
        },
        {
          levelId: '200',
          level: makeRobtopLevel({ name: 'Bloodlust', isRated: true }),
        },
        {
          levelId: '300',
          level: makeRobtopLevel({
            name: 'bloodbath startpos',
            isRated: false,
          }),
        },
      ],
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/gd-search?q=bloodbath'
    )
    const body = (await res.json()) as {
      status: string
      rated: Array<{ inGameId: string }>
      unrated: Array<{ inGameId: string }>
    }

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    // The already-cached '100' is omitted; new rated grouped, new unrated grouped.
    expect(body.rated.map((r) => r.inGameId)).toEqual(['200'])
    expect(body.unrated.map((r) => r.inGameId)).toEqual(['300'])

    // Rated survivor is seeded automatically…
    const seededRated = await prisma.level.findUnique({
      where: { inGameId: '200' },
    })
    expect(seededRated?.dataSource).toBe('robtop_autofill')
    // …the unrated survivor is NOT (seeded only if the user picks it).
    const unseeded = await prisma.level.findUnique({
      where: { inGameId: '300' },
    })
    expect(unseeded).toBeNull()
  })

  it('returns nothing_new when every result is already cached', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '100', name: 'Bloodbath' })

    gdSearchMock.mockResolvedValue({
      status: 'ok',
      results: [
        {
          levelId: '100',
          level: makeRobtopLevel({ name: 'Bloodbath', isRated: true }),
        },
      ],
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/gd-search?q=bloodbath'
    )
    const body = (await res.json()) as { status: string; totalFound: number }

    expect(res.status).toBe(200)
    expect(body.status).toBe('nothing_new')
    expect(body.totalFound).toBe(1)
  })

  it('returns 503 unreachable when the RobTop call fails', async () => {
    const user = await seedUser(prisma)
    gdSearchMock.mockResolvedValue({ status: 'unreachable' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/gd-search?q=bloodbath'
    )
    const body = (await res.json()) as { status: string; retryable?: boolean }

    expect(res.status).toBe(503)
    expect(body.status).toBe('unreachable')
    expect(body.retryable).toBe(true)
  })

  it('400s when q is missing', async () => {
    const user = await seedUser(prisma)
    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/gd-search'
    )
    expect(res.status).toBe(400)
  })

  it('allows an empty query when a browsable filter/sort is present, and forwards the mapped GD params', async () => {
    const user = await seedUser(prisma)
    gdSearchMock.mockResolvedValue({ status: 'ok', results: [] })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/gd-search?difficulty=demon-extreme&sort=downloads'
    )

    expect(res.status).toBe(200)
    // Empty str browse; sort=downloads → type '1'; demon-extreme → diff '-2' +
    // demonFilter '5'.
    expect(gdSearchMock).toHaveBeenCalledWith('', {
      type: '1',
      extraParams: { diff: '-2', demonFilter: '5' },
    })
  })
})

// A browse-level factory covering the user-independent columns the endpoint
// filters and sorts on (seedLevel doesn't expose them).
async function seedBrowseLevel(over: {
  inGameId: string
  name?: string
  creator?: string
  partialDiff?: string | null
  isRated?: boolean
  isDemon?: boolean
  stars?: number | null
  downloads?: number | null
  likes?: number | null
  coins?: number | null
  coinsVerified?: boolean | null
  twoPlayer?: boolean | null
  length?: string | null
  epicValue?: number | null
  featured?: boolean | null
  levelType?: 'CLASSIC' | 'PLATFORMER'
  officialSongId?: number | null
  songId?: string | null
  isNong?: boolean
  objectCount?: number | null
  gddlTier?: number | null
  aredlRank?: number | null
  sheetTier?: number | null
  enjoyment?: number | null
  durationSeconds?: number | null
  gameVersion?: string | null
}) {
  return prisma.level.create({
    data: {
      inGameId: over.inGameId,
      name: over.name ?? `Level ${over.inGameId}`,
      creator: over.creator ?? 'Creator',
      partialDiff: over.partialDiff ?? null,
      isRated: over.isRated ?? false,
      isDemon: over.isDemon ?? false,
      stars: over.stars ?? null,
      downloads: over.downloads ?? null,
      likes: over.likes ?? null,
      coins: over.coins ?? null,
      coinsVerified: over.coinsVerified ?? null,
      twoPlayer: over.twoPlayer ?? null,
      length: over.length ?? null,
      epicValue: over.epicValue ?? null,
      featured: over.featured ?? null,
      levelType: over.levelType ?? 'CLASSIC',
      officialSongId: over.officialSongId ?? null,
      songId: over.songId ?? null,
      isNong: over.isNong ?? false,
      objectCount: over.objectCount ?? null,
      gddlTier: over.gddlTier ?? null,
      aredlRank: over.aredlRank ?? null,
      sheetTier: over.sheetTier ?? null,
      enjoyment: over.enjoyment ?? null,
      durationSeconds: over.durationSeconds ?? null,
      gameVersion: over.gameVersion ?? null,
      dataSource: 'robtop_autofill',
      verified: true,
    },
  })
}

interface BrowseBody {
  data: Array<{
    inGameId: string
    downloads: number | null
    likes: number | null
  }>
  nextCursor: string | null
}
describe('GET /levels/browse (filtered cursor search)', () => {
  it('name-filters, sorts by relevance, and returns the extended row shape', async () => {
    const user = await seedUser(prisma)
    await seedBrowseLevel({
      inGameId: '1',
      name: 'Cataclysm',
      downloads: 500,
      likes: 100,
    })
    await seedBrowseLevel({ inGameId: '2', name: 'Deadlocked' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/browse?q=Cataclysm&sort=relevance'
    )
    const body = (await res.json()) as BrowseBody

    expect(res.status).toBe(200)
    expect(body.data.map((r) => r.inGameId)).toEqual(['1'])
    expect(body.data[0]!.downloads).toBe(500)
    expect(body.data[0]!.likes).toBe(100)
  })

  it('filters by difficulty (partialDiff) with no query', async () => {
    const user = await seedUser(prisma)
    await seedBrowseLevel({
      inGameId: '1',
      partialDiff: 'demon-extreme',
      isDemon: true,
      isRated: true,
    })
    await seedBrowseLevel({ inGameId: '2', partialDiff: 'easy', isRated: true })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/browse?difficulty=demon-extreme'
    )
    const body = (await res.json()) as BrowseBody

    expect(res.status).toBe(200)
    expect(body.data.map((r) => r.inGameId)).toEqual(['1'])
  })

  it('sorts by downloads descending', async () => {
    const user = await seedUser(prisma)
    await seedBrowseLevel({ inGameId: '1', downloads: 10 })
    await seedBrowseLevel({ inGameId: '2', downloads: 300 })
    await seedBrowseLevel({ inGameId: '3', downloads: 200 })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/browse?sort=downloads'
    )
    const body = (await res.json()) as BrowseBody

    expect(res.status).toBe(200)
    expect(body.data.map((r) => r.inGameId)).toEqual(['2', '3', '1'])
  })

  it('paginates with a keyset cursor — no overlap, no gaps across pages', async () => {
    const user = await seedUser(prisma)
    // 35 levels with distinct downloads → two pages (30 + 5).
    for (let i = 0; i < 35; i++) {
      await seedBrowseLevel({ inGameId: String(1000 + i), downloads: i })
    }

    const app = buildApp(levelsApp, { userId: user.id })
    const page1 = (await (
      await app.request('/levels/browse?sort=downloads')
    ).json()) as BrowseBody
    expect(page1.data).toHaveLength(30)
    expect(page1.nextCursor).not.toBeNull()

    const page2 = (await (
      await app.request(
        `/levels/browse?sort=downloads&cursor=${encodeURIComponent(page1.nextCursor!)}`
      )
    ).json()) as BrowseBody
    expect(page2.data).toHaveLength(5)
    expect(page2.nextCursor).toBeNull()

    const all = [...page1.data, ...page2.data].map((r) => r.inGameId)
    expect(new Set(all).size).toBe(35) // no duplicates across pages
  })

  it('sorts by difficulty face first, then star count', async () => {
    const user = await seedUser(prisma)
    // Extreme demon (rank 11), two hard demons (rank 9) differing by stars, an
    // easy (rank 2). Expect face order, with stars breaking the demon-hard tie.
    await seedBrowseLevel({
      inGameId: 'ex',
      partialDiff: 'demon-extreme',
      stars: 2,
    })
    await seedBrowseLevel({
      inGameId: 'hd-lo',
      partialDiff: 'demon-hard',
      stars: 5,
    })
    await seedBrowseLevel({
      inGameId: 'hd-hi',
      partialDiff: 'demon-hard',
      stars: 10,
    })
    await seedBrowseLevel({ inGameId: 'ez', partialDiff: 'easy', stars: 10 })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/browse?sort=stars'
    )
    const body = (await res.json()) as BrowseBody

    expect(res.status).toBe(200)
    expect(body.data.map((r) => r.inGameId)).toEqual([
      'ex',
      'hd-hi',
      'hd-lo',
      'ez',
    ])
  })

  it('honors an ascending sortDir override', async () => {
    const user = await seedUser(prisma)
    await seedBrowseLevel({ inGameId: '1', downloads: 10 })
    await seedBrowseLevel({ inGameId: '2', downloads: 300 })
    await seedBrowseLevel({ inGameId: '3', downloads: 200 })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/browse?sort=downloads&sortDir=asc'
    )
    const body = (await res.json()) as BrowseBody

    expect(res.status).toBe(200)
    expect(body.data.map((r) => r.inGameId)).toEqual(['1', '3', '2'])
  })

  it('filters by creator when searchBy=creator', async () => {
    const user = await seedUser(prisma)
    await seedBrowseLevel({ inGameId: '1', name: 'Alpha', creator: 'Riot' })
    await seedBrowseLevel({ inGameId: '2', name: 'Beta', creator: 'Somebody' })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/browse?q=Riot&searchBy=creator'
    )
    const body = (await res.json()) as BrowseBody

    expect(res.status).toBe(200)
    expect(body.data.map((r) => r.inGameId)).toEqual(['1'])
  })
})

describe('GET /levels/browse (range filters and community sorts)', () => {
  /** The ids a browse returns, in order. */
  async function ids(path: string): Promise<string[]> {
    const user = await seedUser(prisma)
    const res = await buildApp(levelsApp, { userId: user.id }).request(path)
    expect(res.status).toBe(200)
    const body = (await res.json()) as BrowseBody
    return body.data.map((r) => r.inGameId)
  }

  it('bounds a range inclusively and drops levels where the value is unknown', async () => {
    await seedBrowseLevel({ inGameId: 'lo', downloads: 100 })
    await seedBrowseLevel({ inGameId: 'min', downloads: 500 })
    await seedBrowseLevel({ inGameId: 'max', downloads: 1000 })
    await seedBrowseLevel({ inGameId: 'hi', downloads: 5000 })
    await seedBrowseLevel({ inGameId: 'unknown', downloads: null })

    expect(
      await ids('/levels/browse?downloadsMin=500&downloadsMax=1000')
    ).toEqual(['max', 'min'])
  })

  // enjoyment is Decimal(5,2); the bound arrives as a JS float.
  it('bounds a fractional enjoyment against the decimal column', async () => {
    await seedBrowseLevel({ inGameId: 'a', enjoyment: 49.5 })
    await seedBrowseLevel({ inGameId: 'b', enjoyment: 49.49 })
    await seedBrowseLevel({ inGameId: 'c', enjoyment: 80 })

    expect(
      await ids('/levels/browse?enjoymentMin=49.5&enjoymentMax=60')
    ).toEqual(['a'])
  })

  it('bounds the game version numerically, ignoring malformed versions', async () => {
    await seedBrowseLevel({ inGameId: 'v19', gameVersion: '1.9' })
    await seedBrowseLevel({ inGameId: 'v21', gameVersion: '2.1' })
    await seedBrowseLevel({ inGameId: 'v22', gameVersion: '2.2' })
    await seedBrowseLevel({ inGameId: 'odd', gameVersion: '8' })

    expect(
      (await ids('/levels/browse?gameVersionMin=2.0&gameVersionMax=2.1')).sort()
    ).toEqual(['v21'])
  })

  it('sorts GDDL tier with unknown tiers last in both directions', async () => {
    await seedBrowseLevel({ inGameId: 't5', gddlTier: 5 })
    await seedBrowseLevel({ inGameId: 't20', gddlTier: 20 })
    await seedBrowseLevel({ inGameId: 'none', gddlTier: null })

    expect(await ids('/levels/browse?sort=gddlTier')).toEqual([
      't20',
      't5',
      'none',
    ])
    expect(await ids('/levels/browse?sort=gddlTier&sortDir=asc')).toEqual([
      't5',
      't20',
      'none',
    ])
  })

  it('sorts AREDL rank hardest-first by default', async () => {
    await seedBrowseLevel({ inGameId: 'r3', aredlRank: 3 })
    await seedBrowseLevel({ inGameId: 'r1', aredlRank: 1 })
    await seedBrowseLevel({ inGameId: 'none', aredlRank: null })

    expect(await ids('/levels/browse?sort=aredlRank')).toEqual([
      'r1',
      'r3',
      'none',
    ])
  })

  it('sorts sheet tier 0 after the ranked tiers, ahead of unplaced levels', async () => {
    await seedBrowseLevel({ inGameId: 't14', sheetTier: 14 })
    await seedBrowseLevel({ inGameId: 't0', sheetTier: 0 })
    await seedBrowseLevel({ inGameId: 't3', sheetTier: 3 })
    await seedBrowseLevel({ inGameId: 'none', sheetTier: null })

    expect(await ids('/levels/browse?sort=sheetTier')).toEqual([
      't14',
      't3',
      't0',
      'none',
    ])
    expect(await ids('/levels/browse?sort=sheetTier&sortDir=asc')).toEqual([
      't3',
      't14',
      't0',
      'none',
    ])
  })

  it('sorts duration with the length band standing in for an unknown one', async () => {
    await seedBrowseLevel({ inGameId: 'long-known', durationSeconds: 200 })
    await seedBrowseLevel({ inGameId: 'xl-band', length: 'XL' })
    await seedBrowseLevel({ inGameId: 'mid-known', durationSeconds: 90 })
    await seedBrowseLevel({ inGameId: 'long-band', length: 'Long' })
    await seedBrowseLevel({
      inGameId: 'platformer',
      length: 'Platformer',
      levelType: 'PLATFORMER',
    })

    expect(await ids('/levels/browse?sort=duration')).toEqual([
      'long-known',
      'xl-band',
      'mid-known',
      'long-band',
      'platformer',
    ])
  })

  // The unknown-value sentinel is carried in the cursor; if it didn't survive
  // the round trip, page two would restart or skip the null block.
  it('paginates a nulls-last sort without gaps or repeats', async () => {
    for (let i = 0; i < 35; i++) {
      await seedBrowseLevel({
        inGameId: String(2000 + i),
        gddlTier: i % 2 === 0 ? (i % 30) + 1 : null,
      })
    }
    const user = await seedUser(prisma)
    const app = buildApp(levelsApp, { userId: user.id })

    const page1 = (await (
      await app.request('/levels/browse?sort=gddlTier&sortDir=asc')
    ).json()) as BrowseBody
    const page2 = (await (
      await app.request(
        `/levels/browse?sort=gddlTier&sortDir=asc&cursor=${encodeURIComponent(page1.nextCursor!)}`
      )
    ).json()) as BrowseBody

    const all = [...page1.data, ...page2.data].map((r) => r.inGameId)
    expect(page1.data).toHaveLength(30)
    expect(page2.nextCursor).toBeNull()
    expect(new Set(all).size).toBe(35)
  })

  it.each([
    ['an out-of-range bound', 'starsMax=11'],
    ['a non-numeric bound', 'downloadsMin=abc'],
    ['a fractional bound on a whole-number field', 'gddlTierMin=2.5'],
  ])('400s on %s', async (_label, qs) => {
    const user = await seedUser(prisma)
    const res = await buildApp(levelsApp, { userId: user.id }).request(
      `/levels/browse?${qs}`
    )

    expect(res.status).toBe(400)
  })

  it('reads an empty bound as absent, not zero', async () => {
    await seedBrowseLevel({ inGameId: 'negative', likes: -5 })

    expect(await ids('/levels/browse?likesMin=')).toEqual(['negative'])
  })
})
