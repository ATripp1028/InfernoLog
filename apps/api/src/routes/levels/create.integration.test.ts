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
vi.mock('../../utils/gddl', () => ({ fetchGddlTier: vi.fn() }))
// Mock only the SFH HTTP client — checkSfhNongIfDue + the cache write run for
// real against the test DB.
vi.mock('../../utils/songFileHub', () => ({ fetchSongFileHubNong: vi.fn() }))

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
})
