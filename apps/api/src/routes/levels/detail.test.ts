/**
 * Unit tests for the two single-level reads.
 *
 * The pair exists because they have opposite contracts: `/page` resolves a
 * cache miss against GD and keeps not_found and unreachable distinct so the
 * page can branch on them, while the bare `GET /levels/:levelId` is
 * cache-only and must NEVER call GD. The integration suite covers `/page`'s
 * resolution; this covers the validation gate and the cached-only route.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import { buildApp, TEST_USER_ID } from '../../test/utils'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { mockFindOrResolveLevel } = vi.hoisted(() => ({
  mockFindOrResolveLevel: vi.fn(),
}))
vi.mock('../../services/levels/resolve', () => ({
  findOrResolveLevel: mockFindOrResolveLevel,
}))

const detailRoutes = (await import('./detail')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>
const app = buildApp(detailRoutes)

const LEVEL = { inGameId: '12345', name: 'DeathMoon' }

beforeEach(() => {
  vi.clearAllMocks()
  prisma.level.findUnique.mockReset().mockResolvedValue(LEVEL as never)
  prisma.levelProgress.findUnique.mockReset().mockResolvedValue(null)
  mockFindOrResolveLevel
    .mockReset()
    .mockResolvedValue({ status: 'found', level: LEVEL })
})

// ─── GET /levels/:levelId/page ───────────────────────────────────────────────

describe('GET /levels/:levelId/page', () => {
  it('rejects a non-numeric id before resolving anything', async () => {
    // The bare /:levelId route is the tree's catch-all, so this gate is what
    // stops a literal like "browse" reaching GD as a level lookup.
    const res = await app.request('/levels/notanumber/page')

    expect(res.status).toBe(400)
    expect(mockFindOrResolveLevel).not.toHaveBeenCalled()
  })

  it('returns the level with a null progress status when the user has none', async () => {
    const res = await app.request('/levels/12345/page')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { ...LEVEL, userProgressStatus: null },
    })
  })

  it('reports the status of a row in any state, not just completions', async () => {
    // The page renders no values — only the status — so a row in any state
    // is reported.
    prisma.levelProgress.findUnique.mockResolvedValue({
      status: 'DROPPED',
    } as never)

    const body = (await (await app.request('/levels/12345/page')).json()) as {
      data: { userProgressStatus: string | null }
    }

    expect(body.data.userProgressStatus).toBe('DROPPED')
    expect(prisma.levelProgress.findUnique).toHaveBeenCalledWith({
      where: { userId_levelId: { userId: TEST_USER_ID, levelId: '12345' } },
      select: { status: true },
    })
  })

  it("reports COMPLETED, which is what suppresses the page's logging actions", async () => {
    prisma.levelProgress.findUnique.mockResolvedValue({
      status: 'COMPLETED',
    } as never)

    const body = (await (await app.request('/levels/12345/page')).json()) as {
      data: { userProgressStatus: string | null }
    }

    expect(body.data.userProgressStatus).toBe('COMPLETED')
  })

  it('404s with a terminal reason when GD has no such level', async () => {
    mockFindOrResolveLevel.mockResolvedValue({ status: 'not_found' })

    const res = await app.request('/levels/12345/page')

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ reason: 'not_found' })
  })

  it('503s with a retryable reason when GD is unreachable', async () => {
    // Kept distinct from not_found: one is terminal, the other worth retrying.
    mockFindOrResolveLevel.mockResolvedValue({ status: 'unreachable' })

    const res = await app.request('/levels/12345/page')

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      reason: 'unreachable',
      retryable: true,
    })
  })
})

// ─── GET /levels/:levelId ────────────────────────────────────────────────────

describe('GET /levels/:levelId', () => {
  it('returns the cached level', async () => {
    const res = await app.request('/levels/12345')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: LEVEL })
  })

  it('never calls GD, even on a cache miss', async () => {
    // The whole point of this route versus /page.
    prisma.level.findUnique.mockResolvedValue(null)

    const res = await app.request('/levels/12345')

    expect(res.status).toBe(404)
    expect(mockFindOrResolveLevel).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric id', async () => {
    const res = await app.request('/levels/notanumber')

    expect(res.status).toBe(400)
    expect(prisma.level.findUnique).not.toHaveBeenCalled()
  })

  it('reads by the in-game id, which is the primary key', async () => {
    await app.request('/levels/12345')

    expect(prisma.level.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { inGameId: '12345' } })
    )
  })
})
