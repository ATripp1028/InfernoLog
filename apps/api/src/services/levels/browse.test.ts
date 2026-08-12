/**
 * Unit tests for the cache browse query builder.
 *
 * This is hand-built SQL, so the tests assert on the statement it produces
 * rather than on rows: which predicates a filter set contributes, and that the
 * ORDER BY expression and the keyset WHERE stay the SAME expression — if those
 * two ever drift the pagination silently skips or repeats rows. The one piece
 * of behaviour asserted on results is the fetch-one-extra trick that decides
 * `nextCursor`. Prisma is mocked; no DB.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { DeepMockProxy } from 'vitest-mock-extended'
import type { LevelBrowseQuery } from '@infernolog/core'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import('vitest-mock-extended')
  return { prismaMock: mockDeep() }
})

vi.mock('../../utils/prisma', () => ({ default: prismaMock }))

const { browseLevels } = await import('./browse')

// ─── helpers ─────────────────────────────────────────────────────────────────

const prisma = prismaMock as unknown as DeepMockProxy<PrismaClient>

/** A row as the raw query selects it, including the internal keyset value. */
function dbRow(inGameId: string, sortval: number | string = 1) {
  return {
    inGameId,
    name: `Level ${inGameId}`,
    creator: 'Riot',
    songName: null,
    inGameDifficulty: 'Extreme Demon',
    stars: 10,
    featured: true,
    epicValue: 0,
    isRated: true,
    likes: 100,
    downloads: 1000,
    length: 'Long',
    coins: 0,
    coinsVerified: false,
    twoPlayer: false,
    isDemon: true,
    levelType: 'CLASSIC',
    _sortval: sortval,
  }
}

function query(overrides: Partial<LevelBrowseQuery> = {}): LevelBrowseQuery {
  return { searchBy: 'name', sort: 'relevance', ...overrides } as LevelBrowseQuery
}

/** The generated statement, with its parameter placeholders inlined. */
function lastSql(): { text: string; values: unknown[] } {
  const sql = prisma.$queryRaw.mock.lastCall?.[0] as Prisma.Sql
  return { text: sql.strings.join('?'), values: sql.values }
}

/** Everything between WHERE and ORDER BY — empty when there are no filters. */
function whereClause(): string {
  const { text } = lastSql()
  const m = /WHERE([\s\S]*?)ORDER BY/.exec(text)
  return m ? m[1]!.trim() : ''
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.$queryRaw.mockReset().mockResolvedValue([] as never)
})

// ─── sorting ─────────────────────────────────────────────────────────────────

describe('browseLevels — sorting', () => {
  it.each([
    ['likes', 'likes'],
    ['downloads', 'downloads'],
    ['objectCount', 'objectCount'],
    ['name', 'name'],
  ])('orders by the %s column', async (sort, column) => {
    await browseLevels(query({ sort: sort as LevelBrowseQuery['sort'] }))

    expect(lastSql().text).toContain(`"${column}"`)
  })

  it('falls back to downloads when relevance has no query term', async () => {
    // Relevance is meaningless without a term; downloads is the browse default.
    await browseLevels(query({ sort: 'relevance', q: '   ' }))

    const { text } = lastSql()
    expect(text).toContain('"downloads"')
    expect(text).not.toContain('similarity')
  })

  it('uses trigram similarity when relevance has a term', async () => {
    await browseLevels(query({ sort: 'relevance', q: 'bloodbath' }))

    expect(lastSql().text).toContain('similarity')
  })

  it('scores similarity against the creator column when searching by creator', async () => {
    await browseLevels(
      query({ sort: 'relevance', q: 'riot', searchBy: 'creator' })
    )

    expect(lastSql().text).toContain('similarity(COALESCE("creator"')
  })

  it('ranks the stars sort by difficulty face first', async () => {
    // Star count only breaks convention on RobTop's official levels, so the
    // face is the primary key and stars merely the tiebreaker.
    await browseLevels(query({ sort: 'stars' }))

    const { text } = lastSql()
    expect(text).toContain('partialDiff')
    expect(text).toContain('* 1000')
  })

  it.each([
    ['likes', 'DESC'],
    ['name', 'ASC'],
  ])('uses the natural direction for %s', async (sort, expected) => {
    await browseLevels(query({ sort: sort as LevelBrowseQuery['sort'] }))

    expect(lastSql().text).toMatch(new RegExp(`ORDER BY[\\s\\S]*${expected}`))
  })

  it.each([
    ['asc', 'ASC'],
    ['desc', 'DESC'],
  ])('honours an explicit %s direction over the natural one', async (
    sortDir,
    expected
  ) => {
    await browseLevels(
      query({ sort: 'likes', sortDir: sortDir as 'asc' | 'desc' })
    )

    expect(lastSql().text).toMatch(new RegExp(`ORDER BY[\\s\\S]*${expected}`))
  })

  it('always breaks ties on inGameId so the order is total', async () => {
    // Without a unique tiebreaker the keyset cursor cannot be resumed from.
    await browseLevels(query({ sort: 'likes' }))

    expect(lastSql().text).toMatch(/ORDER BY[\s\S]*"inGameId" ASC/)
  })
})

// ─── filters ─────────────────────────────────────────────────────────────────

describe('browseLevels — filters', () => {
  it('emits no WHERE clause when nothing is filtered', async () => {
    await browseLevels(query())

    expect(lastSql().text).not.toContain('WHERE')
  })

  it('matches a query term by both ILIKE and trigram', async () => {
    await browseLevels(query({ q: 'bloodbath' }))

    const where = whereClause()
    expect(where).toContain('ILIKE')
    expect(where).toContain('%')
    expect(lastSql().values).toContain('%bloodbath%')
  })

  it('escapes ILIKE wildcards so a literal "100%" matches literally', async () => {
    await browseLevels(query({ q: '100%' }))

    expect(lastSql().values).toContain('%100\\%%')
  })

  it('escapes underscores and backslashes too', async () => {
    await browseLevels(query({ q: 'a_b\\c' }))

    expect(lastSql().values).toContain('%a\\_b\\\\c%')
  })

  it('filters difficulty on partialDiff', async () => {
    await browseLevels(query({ difficulty: ['demon-extreme', 'demon-insane'] }))

    expect(whereClause()).toContain('"partialDiff" IN')
    expect(lastSql().values).toEqual(
      expect.arrayContaining(['demon-extreme', 'demon-insane'])
    )
  })

  it.each([
    ['unrated', '"isRated" = false'],
    ['rated', '"isRated" = true'],
    ['featured', '"featured" = true'],
    ['epic', '"epicValue" = 1'],
    ['legendary', '"epicValue" = 2'],
    ['mythic', '"epicValue" = 3'],
  ])('maps the %s rate status onto its column', async (status, expected) => {
    await browseLevels(
      query({ rateStatus: [status as 'rated'] })
    )

    expect(whereClause().replace(/\s+/g, ' ')).toContain(expected)
  })

  it('ORs several rate statuses together', async () => {
    // They are alternatives, not a conjunction — ANDing them matches nothing.
    await browseLevels(query({ rateStatus: ['featured', 'epic'] }))

    expect(whereClause()).toContain(' OR ')
  })

  it.each([
    [{ twoPlayer: true }, '"twoPlayer" ='],
    [{ coinsVerified: true }, '"coinsVerified" ='],
    [{ coinCount: [1, 2] }, '"coins" IN'],
    [{ levelType: 'PLATFORMER' }, '"levelType"::text ='],
  ])('adds a predicate for %o', async (filter, expected) => {
    await browseLevels(query(filter as Partial<LevelBrowseQuery>))

    expect(whereClause()).toContain(expected)
  })

  it('applies a false boolean filter rather than treating it as unset', async () => {
    await browseLevels(query({ twoPlayer: false }))

    expect(whereClause()).toContain('"twoPlayer" =')
    expect(lastSql().values).toContain(false)
  })

  it('translates length tokens to their stored labels', async () => {
    await browseLevels(query({ length: ['tiny', 'xl'] }))

    expect(lastSql().values).toEqual(expect.arrayContaining(['Tiny', 'XL']))
  })

  it.each([
    ['official', '"officialSongId" IS NOT NULL'],
    ['nong', '"isNong" = true'],
    ['custom', '("songId" IS NOT NULL AND "isNong" = false)'],
  ])('maps the %s song type onto its columns', async (songType, expected) => {
    await browseLevels(query({ songType: songType as 'official' }))

    expect(whereClause().replace(/\s+/g, ' ')).toContain(expected)
  })

  it('ANDs independent filters together', async () => {
    await browseLevels(query({ twoPlayer: true, coinsVerified: true }))

    expect(whereClause()).toContain(' AND ')
  })
})

// ─── keyset pagination ───────────────────────────────────────────────────────

describe('browseLevels — pagination', () => {
  /** A cursor as encodeCursor would produce it. */
  function cursorFor(v: number | string, id: string) {
    return Buffer.from(JSON.stringify({ v, id })).toString('base64')
  }

  it('fetches one row more than the page size', async () => {
    await browseLevels(query())

    expect(lastSql().values).toContain(31)
  })

  it('returns a cursor and trims the extra row when more remain', async () => {
    prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => dbRow(String(i), i)) as never
    )

    const result = await browseLevels(query())

    expect(result.data).toHaveLength(30)
    expect(result.nextCursor).not.toBeNull()
  })

  it('returns a null cursor on the last page', async () => {
    // An exactly-full page must not emit a phantom empty page after it.
    prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => dbRow(String(i), i)) as never
    )

    const result = await browseLevels(query())

    expect(result.data).toHaveLength(30)
    expect(result.nextCursor).toBeNull()
  })

  it('returns a null cursor for an empty result', async () => {
    const result = await browseLevels(query())

    expect(result).toEqual({ data: [], nextCursor: null })
  })

  it('strips the internal keyset value from the returned rows', async () => {
    prisma.$queryRaw.mockResolvedValue([dbRow('1')] as never)

    const result = await browseLevels(query())

    expect(result.data[0]).not.toHaveProperty('_sortval')
    expect(result.data[0]).toMatchObject({ inGameId: '1' })
  })

  it('anchors the cursor on the last row of the page', async () => {
    prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => dbRow(String(i), i)) as never
    )

    const { nextCursor } = await browseLevels(query())
    const decoded = JSON.parse(
      Buffer.from(nextCursor!, 'base64').toString('utf8')
    ) as { v: number; id: string }

    // The 30th row (index 29), not the extra probe row.
    expect(decoded).toEqual({ v: 29, id: '29' })
  })

  it('re-anchors the next page on the cursor pair', async () => {
    await browseLevels(query({ sort: 'likes', cursor: cursorFor(500, '12345') }))

    const where = whereClause()
    expect(where).toContain('"inGameId" >')
    expect(lastSql().values).toEqual(expect.arrayContaining([500, '12345']))
  })

  it.each([
    ['desc', '<'],
    ['asc', '>'],
  ])('compares with %s using %s', async (sortDir, cmp) => {
    await browseLevels(
      query({
        sort: 'likes',
        sortDir: sortDir as 'asc' | 'desc',
        cursor: cursorFor(500, '12345'),
      })
    )

    expect(whereClause()).toContain(`) ${cmp} `)
  })

  it('casts a text cursor value as text, not a number', async () => {
    // The `name` sort keys on LOWER(name); coercing that to float8 would throw.
    await browseLevels(
      query({ sort: 'name', cursor: cursorFor('deathmoon', '12345') })
    )

    expect(lastSql().values).toContain('deathmoon')
  })

  it.each([
    ['not valid base64 JSON', 'not-a-cursor'],
    ['missing its id', Buffer.from(JSON.stringify({ v: 1 })).toString('base64')],
    [
      'carrying a non-scalar value',
      Buffer.from(JSON.stringify({ v: {}, id: 'x' })).toString('base64'),
    ],
  ])('ignores a cursor that is %s and starts from page one', async (
    _label,
    cursor
  ) => {
    await browseLevels(query({ sort: 'likes', cursor }))

    expect(lastSql().text).not.toContain('WHERE')
  })
})
