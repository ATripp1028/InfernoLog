import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../test/utils'

// Real DB; mock ONLY the external GDBrowser HTTP client.
vi.mock('../utils/prisma', async () => {
  const { getTestPrisma } = await import('../test/utils')
  return { default: getTestPrisma() }
})
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../utils/gdbrowser', () => ({ fetchGdBrowserLevel: vi.fn() }))

const { default: levelsApp } = await import('./levels')
const { fetchGdBrowserLevel } = await import('../utils/gdbrowser')

const prisma = getTestPrisma()
const gdbrowserMock = fetchGdBrowserLevel as unknown as ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.clearAllMocks()
  await truncateAll(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /levels/:levelId/resolve', () => {
  it('returns the cached level without calling GDBrowser on a cache hit', async () => {
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
    expect(gdbrowserMock).not.toHaveBeenCalled()
  })

  it('calls GDBrowser once on a cache miss and writes the result to cache', async () => {
    const user = await seedUser(prisma)
    gdbrowserMock.mockResolvedValue({
      name: 'Fetched Level',
      creator: 'RobTop',
      inGameDifficulty: 'Extreme Demon',
      length: 'Long',
      songName: 'Song',
      songAuthor: 'Author',
      isRated: true,
    })

    const res = await buildApp(levelsApp, { userId: user.id }).request(
      '/levels/222/resolve'
    )
    const body = (await res.json()) as {
      level: { inGameId: string; dataSource: string; verified: boolean } | null
      fallbackToManual: boolean
    }

    expect(res.status).toBe(200)
    expect(gdbrowserMock).toHaveBeenCalledTimes(1)
    expect(gdbrowserMock).toHaveBeenCalledWith('222')
    expect(body.fallbackToManual).toBe(false)
    expect(body.level?.dataSource).toBe('gdbrowser_autofill')
    expect(body.level?.verified).toBe(true)

    // The level was persisted to the cache.
    const cached = await prisma.level.findUnique({ where: { inGameId: '222' } })
    expect(cached?.name).toBe('Fetched Level')
    expect(cached?.inGameDifficulty).toBe('Extreme Demon')
  })

  it('returns the manual-fallback signal (200, not 500) when GDBrowser is down', async () => {
    const user = await seedUser(prisma)
    gdbrowserMock.mockResolvedValue(null)

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
