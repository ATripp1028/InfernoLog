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

  // A rated non-demon stores BOTH, with the star count as the canonical one.
  // The form submits the count directly: "Harder" spans 6 and 7 stars, so the
  // label alone could not have told us which.
  it('stores both the label and the submitted star count', async () => {
    const user = await seedUser(prisma)

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inGameId: '556',
          name: 'Five Star',
          creator: 'Some Creator',
          difficulty: 'Harder',
          stars: 7,
          isDemon: false,
          isRated: true,
        }),
      }
    )

    expect(res.status).toBe(201)
    const stored = await prisma.level.findUnique({
      where: { inGameId: '556' },
    })
    expect(stored?.stars).toBe(7)
    expect(stored?.inGameDifficulty).toBe('Harder')

    const body = (await res.json()) as { data: { inGameDifficulty: string } }
    expect(body.data.inGameDifficulty).toBe('Harder')
  })

  // The count and label come from one picker, so disagreeing values mean a
  // malformed request — storing the count anyway would corrupt the canonical
  // field, so it is dropped and the label (which no count contradicts) stands.
  it('drops a star count that contradicts the submitted label', async () => {
    const user = await seedUser(prisma)

    await buildApp(levelsApp, { userId: user.id }).request('/levels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        inGameId: '558',
        name: 'Mismatched',
        creator: 'Some Creator',
        difficulty: 'Harder',
        stars: 2,
        isDemon: false,
        isRated: true,
      }),
    })

    const stored = await prisma.level.findUnique({
      where: { inGameId: '558' },
    })
    expect(stored?.stars).toBeNull()
    expect(stored?.inGameDifficulty).toBe('Harder')
  })

  // Unrated levels are awarded no stars, so the label is all they have.
  it('stores no star count for an unrated non-demon', async () => {
    const user = await seedUser(prisma)

    await buildApp(levelsApp, { userId: user.id }).request('/levels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        inGameId: '557',
        name: 'Unrated Level',
        creator: 'Some Creator',
        difficulty: 'Harder',
        isDemon: false,
        isRated: false,
      }),
    })

    const stored = await prisma.level.findUnique({
      where: { inGameId: '557' },
    })
    expect(stored?.stars).toBeNull()
    expect(stored?.inGameDifficulty).toBe('Harder')
  })
})
