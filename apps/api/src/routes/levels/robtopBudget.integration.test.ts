/**
 * Integration tests for how the per-user RobTop budget is applied to the three
 * endpoints that can reach GD's servers.
 *
 * The design claim being tested is not "requests are limited" — it is that the
 * limit is invisible during normal use because it is charged ONLY when a
 * request genuinely calls out. So the cache-hit cases matter as much as the
 * refusal cases: if opening a cached level page cost a token, the limit would
 * be reachable by ordinary browsing and the whole approach would be wrong.
 *
 * The budget itself is unit-tested in utils/robtopUserBudget.integration.test.ts;
 * this file is about the wiring.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildApp,
  getTestPrisma,
  truncateAll,
  seedUser,
  seedLevel,
} from '../../test/utils'

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
  fetchRobtopLevelResult: vi.fn(),
  searchRobtopByNameResult: vi.fn(),
}))
vi.mock('../../utils/gddl', () => ({ fetchGddlTier: vi.fn() }))
vi.mock('../../utils/songFileHub', () => ({ fetchSongFileHubNong: vi.fn() }))

const { default: levelsApp } = await import('./index')
const { fetchRobtopLevel, fetchRobtopLevelResult, searchRobtopByNameResult } =
  await import('../../utils/robtop')
const { fetchGddlTier } = await import('../../utils/gddl')
const { fetchSongFileHubNong } = await import('../../utils/songFileHub')

const prisma = getTestPrisma()
const resolveMock = fetchRobtopLevel as unknown as ReturnType<typeof vi.fn>
const pageMock = fetchRobtopLevelResult as unknown as ReturnType<typeof vi.fn>
const searchMock = searchRobtopByNameResult as unknown as ReturnType<
  typeof vi.fn
>

const CACHED_ID = '11111'
const UNCACHED_ID = '99999'

let userId: string

function get(path: string) {
  return buildApp(levelsApp, { userId }).request(path, { method: 'GET' })
}

/** Empties this user's budget so the next charge is refused. */
async function drainBudget() {
  await prisma.$executeRaw`
    INSERT INTO "robtop_user_budget" ("userId", tokens, "lastRefillAt")
    VALUES (${userId}, 0, now())
    ON CONFLICT ("userId") DO UPDATE SET tokens = 0, "lastRefillAt" = now()
  `
}

function budgetRow() {
  return prisma.robtopUserBudget.findUnique({ where: { userId } })
}

beforeEach(async () => {
  vi.clearAllMocks()
  ;(fetchGddlTier as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    null
  )
  ;(
    fetchSongFileHubNong as unknown as ReturnType<typeof vi.fn>
  ).mockResolvedValue(undefined)
  await truncateAll(prisma)
  userId = (await seedUser(prisma, { username: 'budget_routes' })).id
  await seedLevel(prisma, { inGameId: CACHED_ID, name: 'Cached Level' })
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── the property that makes the limit safe to ship ──────────────────────────

describe('a cache hit is free', () => {
  it('GET /levels/:id/resolve does not charge for a cached level', async () => {
    const res = await get(`/levels/${CACHED_ID}/resolve`)

    expect(res.status).toBe(200)
    expect(resolveMock).not.toHaveBeenCalled()
    // No row at all — the budget was never touched.
    expect(await budgetRow()).toBeNull()
  })

  it('GET /levels/:id/page does not charge for a cached level', async () => {
    const res = await get(`/levels/${CACHED_ID}/page`)

    expect(res.status).toBe(200)
    expect(pageMock).not.toHaveBeenCalled()
    expect(await budgetRow()).toBeNull()
  })

  it('serves a cached level even when the budget is spent', async () => {
    // The one thing a user must never lose to their own rate limit: access to
    // data already held. Both endpoints answer from the cache without charging.
    await drainBudget()

    expect((await get(`/levels/${CACHED_ID}/resolve`)).status).toBe(200)
    expect((await get(`/levels/${CACHED_ID}/page`)).status).toBe(200)
  })

  it('does not charge for a request rejected before it would call out', async () => {
    // A malformed id 400s at validation; gd-search with nothing to browse by
    // 400s at the intent gate. Neither reaches RobTop, so neither should cost.
    expect((await get('/levels/not-a-number/resolve')).status).toBe(400)
    expect((await get('/levels/gd-search?q=')).status).toBe(400)

    expect(await budgetRow()).toBeNull()
  })
})

// ─── charging on the paths the cache cannot absorb ───────────────────────────

describe('a cache miss charges', () => {
  it('GET /levels/:id/resolve charges when it calls RobTop', async () => {
    resolveMock.mockResolvedValue(null) // GD unreachable → manual fallback

    await get(`/levels/${UNCACHED_ID}/resolve`)

    expect(resolveMock).toHaveBeenCalled()
    expect((await budgetRow())?.tokens).toBeLessThan(200)
  })

  it('charges a not-found repeatedly — the case the cache can never absorb', async () => {
    // A not-found is deliberately never cached, so each lookup is a fresh
    // RobTop call forever. This is the abuse path the budget exists for.
    pageMock.mockResolvedValue({ status: 'not_found' })

    await get(`/levels/${UNCACHED_ID}/page`)
    const after1 = (await budgetRow())!.tokens
    await get(`/levels/${UNCACHED_ID}/page`)
    const after2 = (await budgetRow())!.tokens

    expect(after2).toBeLessThan(after1)
  })

  it('GET /levels/gd-search charges on every escalation', async () => {
    searchMock.mockResolvedValue({ status: 'unreachable' })

    await get('/levels/gd-search?q=cataclysm')
    const after1 = (await budgetRow())!.tokens
    await get('/levels/gd-search?q=bloodbath')
    const after2 = (await budgetRow())!.tokens

    expect(after2).toBeLessThan(after1)
  })
})

// ─── refusal ─────────────────────────────────────────────────────────────────

describe('refusing once the budget is spent', () => {
  beforeEach(drainBudget)

  it('429s gd-search without calling RobTop', async () => {
    const res = await get('/levels/gd-search?q=cataclysm')

    expect(res.status).toBe(429)
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('429s an uncached resolve without calling RobTop', async () => {
    const res = await get(`/levels/${UNCACHED_ID}/resolve`)

    expect(res.status).toBe(429)
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('429s an uncached page without calling RobTop, and writes no level', async () => {
    const res = await get(`/levels/${UNCACHED_ID}/page`)

    expect(res.status).toBe(429)
    expect(pageMock).not.toHaveBeenCalled()
    expect(
      await prisma.level.findUnique({ where: { inGameId: UNCACHED_ID } })
    ).toBeNull()
  })

  it('answers with a concrete wait the client can show', async () => {
    const res = await get('/levels/gd-search?q=cataclysm')
    const body = (await res.json()) as {
      reason: string
      retryAfterSeconds: number
    }

    expect(body.reason).toBe('rate_limited')
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
    expect(res.headers.get('Retry-After')).toBe(String(body.retryAfterSeconds))
  })

  it('is scoped to the spender — another user is unaffected', async () => {
    const other = await seedUser(prisma, { username: 'innocent' })
    searchMock.mockResolvedValue({ status: 'unreachable' })

    const res = await buildApp(levelsApp, { userId: other.id }).request(
      '/levels/gd-search?q=cataclysm',
      { method: 'GET' }
    )

    expect(res.status).not.toBe(429)
  })
})
