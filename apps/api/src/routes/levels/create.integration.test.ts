import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
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
const { fetchGddlTier } = await import('../../utils/gddl')
const { fetchSongFileHubNong } = await import('../../utils/songFileHub')

const prisma = getTestPrisma()
const gddlTierMock = fetchGddlTier as unknown as ReturnType<typeof vi.fn>
const sfhMock = fetchSongFileHubNong as unknown as ReturnType<typeof vi.fn>
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

  // The manual form's other choice: a level GD has not rated. The flags follow
  // the label here too, so nothing the client sends can contradict it.
  it('stores an unrated level with both flags false', async () => {
    const user = await seedUser(prisma)

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inGameId: '556',
          name: 'Brand New',
          creator: 'Some Creator',
          difficulty: 'Unrated',
        }),
      }
    )

    expect(res.status).toBe(201)
    const stored = await prisma.level.findUnique({
      where: { inGameId: '556' },
    })
    expect(stored?.inGameDifficulty).toBe('Unrated')
    expect(stored?.isDemon).toBe(false)
    expect(stored?.isRated).toBe(false)
  })

  // The form cannot create what the cache would refuse from GD, so the refusal
  // is the schema's: no lookup, no row, no 500.
  it('400s on a rated non-demon difficulty and writes nothing', async () => {
    const user = await seedUser(prisma)

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inGameId: '557',
          name: 'Five Star',
          creator: 'Some Creator',
          difficulty: 'Harder',
        }),
      }
    )

    expect(res.status).toBe(400)
    await expect(
      prisma.level.findUnique({ where: { inGameId: '557' } })
    ).resolves.toBeNull()
  })
})
