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
vi.mock('../utils/robtop', () => ({ fetchRobtopLevel: vi.fn() }))
vi.mock('../utils/gddl', () => ({ fetchGddlTier: vi.fn() }))

const { default: levelsApp } = await import('./levels')
const { fetchRobtopLevel } = await import('../utils/robtop')
const { fetchGddlTier } = await import('../utils/gddl')

const prisma = getTestPrisma()
const robtopMock = fetchRobtopLevel as unknown as ReturnType<typeof vi.fn>
const gddlTierMock = fetchGddlTier as unknown as ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.clearAllMocks()
  // Default: GDDL has no suggested tier. Individual tests override.
  gddlTierMock.mockResolvedValue(null)
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
    expect(await prisma.level.findUnique({ where: { inGameId: '333' } })).toBeNull()
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
        isCompletion: true,
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
    const created = await prisma.level.findUnique({ where: { inGameId: '555' } })
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
