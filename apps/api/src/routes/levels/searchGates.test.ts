/**
 * Unit tests for the three search endpoints' query gates.
 *
 * All three take their filters from the query string, so the boolean coercion
 * is load-bearing: `?twoPlayer=anything` must not read as `true`. The
 * integration suite exercises the happy paths; these cover the rejections and
 * the coercion edges. The services are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../test/utils'

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

const { mockBrowseLevels, mockRunGdSearch } = vi.hoisted(() => ({
  mockBrowseLevels: vi.fn(),
  mockRunGdSearch: vi.fn(),
}))

vi.mock('../../services/levels/browse', () => ({
  browseLevels: mockBrowseLevels,
}))
vi.mock('../../services/levels/gdSearch', () => ({
  runGdSearch: mockRunGdSearch,
}))
vi.mock('../../utils/robtopUserBudget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/robtopUserBudget')>()),
  // These specs are about routing and the query gates, not metering, and they
  // run against a mocked Prisma that has no budget row to charge. The real
  // helper is covered by its own integration suite; the route wiring by
  // robtopBudget.integration.test.ts.
  chargeRobtopBudget: vi.fn().mockResolvedValue(undefined),
}))

const searchRoutes = (await import('./search')).default

// ─── helpers ─────────────────────────────────────────────────────────────────

const app = buildApp(searchRoutes)

/** The query object the browse service received. */
function browseQuery(): Record<string, unknown> {
  return mockBrowseLevels.mock.lastCall?.[0] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBrowseLevels.mockReset().mockResolvedValue({ data: [], nextCursor: null })
  mockRunGdSearch
    .mockReset()
    .mockResolvedValue({ status: 'nothing_new', totalFound: 0 })
})

// ─── GET /levels/search ──────────────────────────────────────────────────────

describe('GET /levels/search', () => {
  it('400s without a query term', async () => {
    // The lightweight autocomplete has nothing to match on without one.
    const res = await app.request('/levels/search')

    expect(res.status).toBe(400)
  })
})

// ─── GET /levels/browse ──────────────────────────────────────────────────────

describe('GET /levels/browse', () => {
  it('400s on a query that fails validation', async () => {
    const res = await app.request('/levels/browse?sort=nonsense')

    expect(res.status).toBe(400)
    expect(mockBrowseLevels).not.toHaveBeenCalled()
  })

  it('browses with no query term at all', async () => {
    const res = await app.request('/levels/browse')

    expect(res.status).toBe(200)
    expect(mockBrowseLevels).toHaveBeenCalled()
  })

  it.each([
    ['true', true],
    ['false', false],
  ])('coerces twoPlayer=%s to %s', async (raw, expected) => {
    await app.request(`/levels/browse?twoPlayer=${raw}`)

    expect(browseQuery().twoPlayer).toBe(expected)
  })

  it('leaves a non-boolean twoPlayer unset rather than truthy', async () => {
    // `?twoPlayer=maybe` reading as true would silently filter the results.
    await app.request('/levels/browse?twoPlayer=maybe')

    expect(browseQuery().twoPlayer).toBeUndefined()
  })

  it('passes the cursor through', async () => {
    await app.request('/levels/browse?cursor=abc123')

    expect(browseQuery().cursor).toBe('abc123')
  })
})

// ─── GET /levels/gd-search ───────────────────────────────────────────────────

describe('GET /levels/gd-search', () => {
  it('400s on a query that fails validation', async () => {
    const res = await app.request('/levels/gd-search?sort=nonsense')

    expect(res.status).toBe(400)
    expect(mockRunGdSearch).not.toHaveBeenCalled()
  })

  it('escalates to the GD servers on a valid request', async () => {
    const res = await app.request('/levels/gd-search?q=bloodbath')

    expect(res.status).toBe(200)
    expect(mockRunGdSearch).toHaveBeenCalled()
  })
})
