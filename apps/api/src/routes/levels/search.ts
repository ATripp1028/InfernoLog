// Finding levels:
//
//   GET /v1/levels/search     — fuzzy name search over the cache (pg_trgm)
//   GET /v1/levels/browse     — the /search page's filtered, keyset-paginated cache search
//   GET /v1/levels/gd-search  — opt-in escalation to the live GD servers
//
// ⚠️ Every path here is a literal segment where /:levelId also matches. These
// routes MUST be mounted before detail.ts — Hono resolves by registration
// order, not static-over-param, so mounting detail first makes /levels/search
// match as levelId="search". See index.ts and routing.test.ts.

import { Hono } from 'hono'
import { Prisma } from '@prisma/client'
import * as Sentry from '@sentry/node'
import { LevelBrowseQuerySchema } from '@infernolog/core'
import type { LevelSearchResult } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { runGdSearch } from '../../services/gdSearch'
import { browseLevels } from '../../services/levelBrowse'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// Parses the shared browse/filter query string (arrays as repeated params,
// booleans as "true"/"false", coin counts as numbers) and validates it. Used by
// both GET /v1/levels/browse and the filter-forwarding GET /v1/levels/gd-search.
function parseBrowseQuery(sp: URLSearchParams) {
  const parseBool = (key: string): boolean | undefined => {
    const v = sp.get(key)
    if (v === 'true') return true
    if (v === 'false') return false
    return undefined
  }
  const arr = (key: string): string[] | undefined => {
    const v = sp.getAll(key)
    return v.length > 0 ? v : undefined
  }
  return LevelBrowseQuerySchema.safeParse({
    q: sp.get('q') ?? undefined,
    searchBy: sp.get('searchBy') ?? undefined,
    sort: sp.get('sort') ?? undefined,
    sortDir: sp.get('sortDir') ?? undefined,
    cursor: sp.get('cursor') ?? undefined,
    difficulty: arr('difficulty'),
    rateStatus: arr('rateStatus'),
    twoPlayer: parseBool('twoPlayer'),
    coinCount: sp.getAll('coinCount').length
      ? sp.getAll('coinCount').map(Number)
      : undefined,
    coinsVerified: parseBool('coinsVerified'),
    length: arr('length'),
    levelType: sp.get('levelType') ?? undefined,
    songType: sp.get('songType') ?? undefined,
  })
}

// GET /v1/levels/search?q= — name search backed by the pg_trgm GIN index.
// Two complementary matchers, both index-supported by gin_trgm_ops:
//   • ILIKE '%q%'  — substring/prefix match, so short fragments like "Cat"
//     surface "Cataclysm" (the `%` similarity operator alone needs ~4 chars of
//     a long name to clear pg_trgm's 0.3 threshold).
//   • name % q     — trigram similarity, for typo tolerance ("Cataclism").
// Results are ordered by similarity so the closest name ranks first.
app.get('/levels/search', async (c) => {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ error: 'Query parameter "q" is required' }, 400)

  // Escape ILIKE wildcards in user input so "100%" matches literally.
  const likePattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`

  try {
    const results = await prisma.$queryRaw<LevelSearchResult[]>(Prisma.sql`
      SELECT "inGameId", "name", "creator", "inGameDifficulty", "stars", "featured", "epicValue", "songName", "isRated"
      FROM "levels"
      WHERE "name" ILIKE ${likePattern} OR "name" % ${q}
      ORDER BY similarity("name", ${q}) DESC, "name" ASC
      LIMIT 20
    `)
    return c.json({ data: results })
  } catch (error) {
    console.error('GET /levels/search error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /v1/levels/browse — the /search page's cursor-paginated, filtered cache
// search. Reads the filters/sort/cursor from the query string (arrays as
// repeated params), validates them, and delegates to browseLevels.
app.get('/levels/browse', async (c) => {
  const sp = new URL(c.req.url).searchParams
  const parsed = parseBrowseQuery(sp)
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }

  try {
    const result = await browseLevels(parsed.data)
    return c.json(result)
  } catch (error) {
    console.error('GET /levels/browse error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /v1/levels/gd-search?q= — the opt-in GD-server search escalation. One
// getGJLevels21 query (first page only — never cursor-paginated), cache dedupe,
// rated/unrated partition, and automatic seeding of rated survivors (see
// services/gdSearch.ts). Fired only on explicit user confirmation from a
// cache-search UI; never on keystroke. The /search page's filters/sort are
// forwarded where GD's schema permits, so an empty query is valid as long as
// there is a forwardable filter or a downloads/likes sort to browse by. Shares
// the RobTop rate limiter, hence the extended timeout in sst.config.ts.
app.get('/levels/gd-search', async (c) => {
  const sp = new URL(c.req.url).searchParams
  const parsed = parseBrowseQuery(sp)
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }
  // `filters` carries the LevelSearchFilters subset (plus an ignored cursor,
  // which the escalation never paginates).
  const { q, sort, searchBy, ...filters } = parsed.data
  const trimmed = q?.trim() ?? ''

  // A query-less escalation only makes sense as a GD browse (most downloaded /
  // liked, optionally filtered). Without a term, a filter, or such a sort there
  // is nothing to ask GD for.
  const hasBrowseIntent =
    filters.difficulty?.length ||
    filters.rateStatus?.length ||
    filters.length?.length ||
    filters.twoPlayer !== undefined ||
    filters.coinCount?.some((v) => v > 0) ||
    filters.songType === 'custom' ||
    sort === 'downloads' ||
    sort === 'likes'
  if (trimmed.length === 0 && !hasBrowseIntent) {
    return c.json(
      { error: 'A query or a browsable filter/sort is required' },
      400
    )
  }

  try {
    // Creator search-by has no GD equivalent, so the query term is only
    // forwarded in name mode; a creator escalation degrades to a filter browse.
    const gdQuery = searchBy === 'creator' ? '' : trimmed
    const outcome = await runGdSearch(gdQuery, filters, sort)
    // A failed RobTop call is retryable and distinct from "nothing new" — 503
    // so the client can offer a retry rather than showing an empty result.
    if (outcome.status === 'unreachable') {
      return c.json({ status: 'unreachable', retryable: true }, 503)
    }
    return c.json(outcome)
  } catch (error) {
    console.error('GET /levels/gd-search error:', error)
    Sentry.captureException(error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default app
