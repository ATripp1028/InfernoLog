// Pins the mount order in index.ts.
//
// `/levels/:levelId` (detail.ts) matches any single segment, so if it were
// mounted before search.ts, every literal path under /levels would be captured
// as a level id. Hono matches by registration order — it does NOT prefer a
// static segment over a parameterised one — so nothing but the mount order in
// index.ts prevents this.
//
// The failure mode is quiet: /levels/search would match with levelId="search",
// fail LevelIdSchema, and return 400 "Level ID must be numeric" instead of
// running the search. These tests assert each literal path reaches its own
// handler rather than the id route.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp, TEST_USER_ID } from '../../test/utils'

const { mockBrowseLevels, mockRunGdSearch, mockQueryRaw } = vi.hoisted(() => ({
  mockBrowseLevels: vi.fn(),
  mockRunGdSearch: vi.fn(),
  mockQueryRaw: vi.fn(),
}))

vi.mock('../../utils/prisma', () => ({
  default: {
    $queryRaw: mockQueryRaw,
    level: { findUnique: vi.fn(), create: vi.fn() },
    levelProgress: { findUnique: vi.fn() },
    progressUpdate: { findFirst: vi.fn() },
  },
}))
vi.mock('@sentry/node', () => ({ captureException: vi.fn() }))
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../../services/levels/browse', () => ({
  browseLevels: mockBrowseLevels,
}))
vi.mock('../../services/levels/gdSearch', () => ({ runGdSearch: mockRunGdSearch }))

const { default: levelsApp } = await import('./index')

const app = () => buildApp(levelsApp, { userId: TEST_USER_ID })

beforeEach(() => {
  vi.clearAllMocks()
  mockQueryRaw.mockResolvedValue([])
  mockBrowseLevels.mockResolvedValue({ data: [], cursor: null, hasMore: false })
  mockRunGdSearch.mockResolvedValue({ status: 'ok', data: [] })
})

describe('literal /levels paths are not captured by /levels/:levelId', () => {
  it('routes /levels/search to the search handler', async () => {
    const res = await app().request('/levels/search?q=cataclysm')

    expect(res.status).toBe(200)
    expect(mockQueryRaw).toHaveBeenCalled()
  })

  it('routes /levels/browse to the browse handler', async () => {
    const res = await app().request('/levels/browse')

    expect(res.status).toBe(200)
    expect(mockBrowseLevels).toHaveBeenCalled()
  })

  it('routes /levels/gd-search to the gd-search handler', async () => {
    const res = await app().request('/levels/gd-search?q=cataclysm')

    expect(res.status).toBe(200)
    expect(mockRunGdSearch).toHaveBeenCalled()
  })

  // The exact symptom a wrong mount order produces, asserted as an absence:
  // the id route rejects non-numeric segments with this 400.
  it.each(['/levels/search?q=x', '/levels/browse', '/levels/gd-search?q=x'])(
    '%s never falls through to the numeric-id rejection',
    async (path) => {
      const res = await app().request(path)
      const body = (await res.json()) as { error?: unknown }

      expect(res.status).not.toBe(400)
      expect(body.error).not.toBe('Level ID must be numeric')
    }
  )
})
