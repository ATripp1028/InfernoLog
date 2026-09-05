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
vi.mock('../../utils/gddl', () => ({ fetchGddlTier: vi.fn() }))
// Mock only the SFH HTTP client — checkSfhNongIfDue + the cache write run for
// real against the test DB.
vi.mock('../../utils/songFileHub', () => ({ fetchSongFileHubNong: vi.fn() }))

const { default: levelsApp } = await import('./index')
const { fetchRobtopLevelResult } = await import('../../utils/robtop')
const { fetchGddlTier } = await import('../../utils/gddl')
const { fetchSongFileHubNong } = await import('../../utils/songFileHub')

const prisma = getTestPrisma()
const robtopResultMock = fetchRobtopLevelResult as unknown as ReturnType<
  typeof vi.fn
>
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

describe('GET /levels/:levelId/page', () => {
  it('returns a cached level with a null progress status and no RobTop call', async () => {
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
    expect(body.data.userProgressStatus).toBeNull()
    // Page-only fields that the logging wire shape omits.
    expect(body.data).toHaveProperty('delistedAt')
    expect(body.data).toHaveProperty('lastCheckedAt')
    expect(robtopResultMock).not.toHaveBeenCalled()
  })

  it('reports the status of a LevelProgress row in any state', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '811' })
    // A non-completed row still counts — the cross-link condition is any row.
    await prisma.levelProgress.create({
      data: { userId: user.id, levelId: '811', status: 'IN_PROGRESS' },
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/811/page'
    )
    const body = (await res.json()) as {
      data: { userProgressStatus: string | null }
    }

    expect(res.status).toBe(200)
    expect(body.data.userProgressStatus).toBe('IN_PROGRESS')
  })

  it('reports COMPLETED, which the page uses to drop invalid FAB actions', async () => {
    const user = await seedUser(prisma)
    await seedLevel(prisma, { inGameId: '820' })
    await prisma.levelProgress.create({
      data: { userId: user.id, levelId: '820', status: 'COMPLETED' },
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/820/page'
    )
    const body = (await res.json()) as {
      data: { userProgressStatus: string | null }
    }

    expect(res.status).toBe(200)
    expect(body.data.userProgressStatus).toBe('COMPLETED')
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
    expect(body.data.userProgressStatus).toBeNull()

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
