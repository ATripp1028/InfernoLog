/**
 * Unit tests for the GD-server search escalation.
 *
 * Two halves. The filter mapping only forwards the subset GD's schema can
 * express — forwarding a filter GD reads differently (a coin COUNT as its
 * has-coins boolean, several demon tiers as one) would silently return the
 * wrong set. The escalation itself must keep `nothing_new` distinct from
 * `unreachable`: the user consented to a network call, so "it worked, there's
 * just nothing new" and "the call failed" are different answers. Prisma and the
 * RobTop client are mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { LevelSearchFilters, LevelSort } from '@infernolog/core'
import type { RobtopLevel, RobtopSearchResult } from '../../utils/robtop'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))

const { mockSearchResult } = vi.hoisted(() => ({ mockSearchResult: vi.fn() }))
vi.mock('../../utils/robtop', () => ({
  searchRobtopByNameResult: mockSearchResult,
}))
vi.mock('./robtopMapping', () => ({
  buildRobtopCreateData: vi.fn((id: string) => ({ inGameId: id })),
}))

const { runGdSearch } = await import('./gdSearch')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

function hit(levelId: string, isRated = true): RobtopSearchResult {
  return {
    levelId,
    level: {
      name: `Level ${levelId}`,
      creator: 'Riot',
      songName: null,
      inGameDifficulty: 'Extreme Demon',
      stars: 10,
      featured: true,
      epicValue: 0,
      isRated,
    } as unknown as RobtopLevel,
  }
}

/** The getGJLevels21 params the escalation forwarded. */
function forwarded(): { type?: string } & Record<string, string> {
  const [, options] = mockSearchResult.mock.lastCall as [
    string,
    { type?: string; extraParams: Record<string, string> },
  ]
  return {
    ...options.extraParams,
    ...(options.type ? { type: options.type } : {}),
  }
}

function search(
  q = 'bloodbath',
  filters: LevelSearchFilters = {},
  sort: LevelSort = 'relevance'
) {
  return runGdSearch(q, filters, sort)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSearchResult.mockReset().mockResolvedValue({ status: 'ok', results: [] })
  prisma.level.findMany.mockReset().mockResolvedValue([] as never)
  prisma.level.upsert.mockReset().mockResolvedValue({} as never)
})

// ─── filter mapping ──────────────────────────────────────────────────────────

describe('runGdSearch — filter mapping', () => {
  it('forwards non-demon difficulties as GD diff codes', async () => {
    await search('x', { difficulty: ['easy', 'hard'] })

    expect(forwarded().diff).toBe('1,3')
    expect(forwarded()).not.toHaveProperty('demonFilter')
  })

  it('adds the demon bucket and narrows when exactly one tier is chosen', async () => {
    await search('x', { difficulty: ['demon-extreme'] })

    expect(forwarded().diff).toBe('-2')
    expect(forwarded().demonFilter).toBe('5')
  })

  it('drops demonFilter when several tiers are chosen', async () => {
    // GD's demonFilter narrows to ONE tier, so forwarding it for a multi-tier
    // selection would silently exclude the others.
    await search('x', { difficulty: ['demon-easy', 'demon-hard'] })

    expect(forwarded().diff).toBe('-2')
    expect(forwarded()).not.toHaveProperty('demonFilter')
  })

  it('combines demon and non-demon selections', async () => {
    await search('x', { difficulty: ['easy', 'demon-hard'] })

    expect(forwarded().diff).toBe('1,-2')
    expect(forwarded().demonFilter).toBe('3')
  })

  it('forwards lengths as GD length numbers', async () => {
    await search('x', { length: ['tiny', 'xl'] })

    expect(forwarded().len).toBe('0,4')
  })

  it('forwards twoPlayer only when true', async () => {
    await search('x', { twoPlayer: true })
    expect(forwarded().twoPlayer).toBe('1')

    await search('x', { twoPlayer: false })
    expect(forwarded()).not.toHaveProperty('twoPlayer')
  })

  it('collapses a coin count to GD’s has-coins boolean', async () => {
    // GD has no exact-count filter; the count stays a cache-only refinement.
    await search('x', { coinCount: [2, 3] })

    expect(forwarded().coins).toBe('1')
  })

  it('does not ask GD for coins when only zero was selected', async () => {
    await search('x', { coinCount: [0] })

    expect(forwarded()).not.toHaveProperty('coins')
  })

  it.each([
    ['featured', 'featured'],
    ['epic', 'epic'],
    ['legendary', 'legendary'],
    ['mythic', 'mythic'],
  ])('forwards the %s rate status', async (status, param) => {
    await search('x', { rateStatus: [status as 'featured'] })

    expect(forwarded()[param]).toBe('1')
  })

  it('forwards star for a plain rated filter', async () => {
    await search('x', { rateStatus: ['rated'] })

    expect(forwarded().star).toBe('1')
  })

  it('drops star when a showcase filter is also set', async () => {
    // The showcase params already imply rated; sending both narrows wrongly.
    await search('x', { rateStatus: ['rated', 'epic'] })

    expect(forwarded()).not.toHaveProperty('star')
    expect(forwarded().epic).toBe('1')
  })

  it('forwards noStar only when unrated is the sole selection', async () => {
    await search('x', { rateStatus: ['unrated'] })
    expect(forwarded().noStar).toBe('1')

    await search('x', { rateStatus: ['unrated', 'rated'] })
    expect(forwarded()).not.toHaveProperty('noStar')
  })

  it('forwards customSong for the custom song type', async () => {
    await search('x', { songType: 'custom' })

    expect(forwarded().customSong).toBe('1')
  })

  it.each([
    ['downloads', '1'],
    ['likes', '2'],
  ])('maps the %s sort onto a query-less browse type', async (sort, type) => {
    await search('', {}, sort as LevelSort)

    expect(forwarded().type).toBe(type)
  })

  it('keeps the default search type when a query term is present', async () => {
    // A term means type=0 (search-by-str); a browse type would ignore it.
    await search('bloodbath', {}, 'downloads')

    expect(forwarded()).not.toHaveProperty('type')
  })

  it('sends no browse type for a sort GD has no equivalent for', async () => {
    await search('', {}, 'relevance')

    expect(forwarded()).not.toHaveProperty('type')
  })

  it('trims the query before sending it', async () => {
    await search('  bloodbath  ')

    expect(mockSearchResult.mock.lastCall?.[0]).toBe('bloodbath')
  })
})

// ─── outcomes ────────────────────────────────────────────────────────────────

describe('runGdSearch — outcomes', () => {
  it('partitions survivors into rated and unrated', async () => {
    mockSearchResult.mockResolvedValue({
      status: 'ok',
      results: [hit('1', true), hit('2', false)],
    })

    const outcome = await search()

    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(outcome.rated.map((r) => r.inGameId)).toEqual(['1'])
    expect(outcome.unrated.map((r) => r.inGameId)).toEqual(['2'])
  })

  it('seeds the rated survivors and leaves the unrated alone', async () => {
    // Unrated levels are only cached if the user actually selects one.
    mockSearchResult.mockResolvedValue({
      status: 'ok',
      results: [hit('1', true), hit('2', false)],
    })

    await search()

    expect(prisma.level.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.level.upsert).toHaveBeenCalledWith({
      where: { inGameId: '1' },
      create: { inGameId: '1' },
      update: {},
    })
  })

  it('upserts rather than creates, so a concurrent seed does not throw', async () => {
    mockSearchResult.mockResolvedValue({ status: 'ok', results: [hit('1')] })

    await search()

    const [args] = prisma.level.upsert.mock.lastCall as unknown as [
      { update: Record<string, unknown> },
    ]
    expect(args.update).toEqual({})
  })

  it('drops results already in the cache', async () => {
    mockSearchResult.mockResolvedValue({
      status: 'ok',
      results: [hit('1'), hit('2')],
    })
    prisma.level.findMany.mockResolvedValue([{ inGameId: '1' }] as never)

    const outcome = await search()

    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(outcome.rated.map((r) => r.inGameId)).toEqual(['2'])
  })

  it('reports nothing_new with the pre-dedupe count when all were cached', async () => {
    // The count lets the client say "all N are already cached".
    mockSearchResult.mockResolvedValue({
      status: 'ok',
      results: [hit('1'), hit('2')],
    })
    prisma.level.findMany.mockResolvedValue([
      { inGameId: '1' },
      { inGameId: '2' },
    ] as never)

    await expect(search()).resolves.toEqual({
      status: 'nothing_new',
      totalFound: 2,
    })
  })

  it('reports nothing_new when GD found nothing at all', async () => {
    await expect(search()).resolves.toEqual({
      status: 'nothing_new',
      totalFound: 0,
    })
    expect(prisma.level.findMany).not.toHaveBeenCalled()
  })

  it('keeps unreachable distinct from nothing_new', async () => {
    // The user paid for a network call; a failure must not read as "no results".
    mockSearchResult.mockResolvedValue({ status: 'unreachable' })

    await expect(search()).resolves.toEqual({ status: 'unreachable' })
    expect(prisma.level.upsert).not.toHaveBeenCalled()
  })

  it('returns rows in the same shape the cache search returns', async () => {
    mockSearchResult.mockResolvedValue({ status: 'ok', results: [hit('1')] })

    const outcome = await search()

    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(outcome.rated[0]).toEqual({
      inGameId: '1',
      name: 'Level 1',
      creator: 'Riot',
      songName: null,
      inGameDifficulty: 'Extreme Demon',
      stars: 10,
      featured: true,
      epicValue: 0,
      isRated: true,
    })
  })
})
