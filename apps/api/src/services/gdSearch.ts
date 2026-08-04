// GD-server name-search escalation (opt-in, on explicit confirm only). Runs a
// single unfiltered getGJLevels21 name query, drops levels already in the
// cache, partitions the survivors into rated/unrated, and seeds the rated ones
// automatically (data_source=robtop_autofill — same trustworthiness as any
// other autofill, so no seeded-vs-logged distinction is stored). Unrated
// survivors are returned but NOT seeded; the client seeds one only if the user
// selects it (by navigating to its Global Level Page, which resolves+caches on
// the miss). See the SpecNote decision record for the locked reasoning.

import type {
  LevelSearchResult,
  LevelSearchFilters,
  LevelSort,
} from '@infernolog/core'
import prisma from '../utils/prisma'
import { searchRobtopByNameResult, type RobtopLevel } from '../utils/robtop'
import { buildRobtopCreateData } from './levelResolve'

// ── /search-page filters → getGJLevels21 params ────────────────────────────
// Only the subset GD's schema can express is forwarded; everything else (exact
// coin count, coinsVerified, creator search, NONG, object count) is dropped and
// stays a cache-only refinement. See the /search plan's mapping notes.
const NONDEMON_DIFF: Record<string, string> = {
  auto: '-3',
  easy: '1',
  normal: '2',
  hard: '3',
  harder: '4',
  insane: '5',
}
const DEMON_FILTER: Record<string, string> = {
  'demon-easy': '1',
  'demon-medium': '2',
  'demon-hard': '3',
  'demon-insane': '4',
  'demon-extreme': '5',
}
const LEN_NUM: Record<string, string> = {
  tiny: '0',
  short: '1',
  medium: '2',
  long: '3',
  xl: '4',
}

function buildRobtopParams(
  filters: LevelSearchFilters,
  sort: LevelSort,
  hasQuery: boolean
): { type?: string; extraParams: Record<string, string> } {
  const p: Record<string, string> = {}

  if (filters.difficulty?.length) {
    const diffs: string[] = []
    const demonTiers: string[] = []
    for (const d of filters.difficulty) {
      if (d.startsWith('demon-')) demonTiers.push(DEMON_FILTER[d]!)
      else diffs.push(NONDEMON_DIFF[d]!)
    }
    // Any demon tier means adding the -2 (Demon) diff bucket; GD's demonFilter
    // narrows to a single tier, so only forward it when exactly one is chosen.
    if (demonTiers.length) diffs.push('-2')
    if (diffs.length) p.diff = diffs.join(',')
    if (demonTiers.length === 1) p.demonFilter = demonTiers[0]!
  }

  if (filters.length?.length) {
    p.len = filters.length.map((l) => LEN_NUM[l]!).join(',')
  }
  if (filters.twoPlayer === true) p.twoPlayer = '1'
  // GD only has a "has user coins" boolean, not an exact count.
  if (filters.coinCount?.some((c) => c > 0)) p.coins = '1'

  const rs = filters.rateStatus ?? []
  if (rs.includes('featured')) p.featured = '1'
  if (rs.includes('epic')) p.epic = '1'
  if (rs.includes('legendary')) p.legendary = '1'
  if (rs.includes('mythic')) p.mythic = '1'
  const hasShowcase = rs.some((r) =>
    ['featured', 'epic', 'legendary', 'mythic'].includes(r)
  )
  if (rs.includes('rated') && !hasShowcase) p.star = '1'
  if (rs.length === 1 && rs[0] === 'unrated') p.noStar = '1'

  if (filters.songType === 'custom') p.customSong = '1'

  // Sort → getGJLevels21 `type` only matters for a query-less browse; a query
  // keeps type=0 (search-by-str). Relevance and the cache-only sorts have no GD
  // equivalent and fall back to the default order.
  const result: { type?: string; extraParams: Record<string, string> } = {
    extraParams: p,
  }
  if (!hasQuery) {
    if (sort === 'downloads') result.type = '1'
    else if (sort === 'likes') result.type = '2'
  }
  return result
}

export type GdSearchOutcome =
  // The call succeeded and at least one not-already-cached level survived.
  | { status: 'ok'; rated: LevelSearchResult[]; unrated: LevelSearchResult[] }
  // The call succeeded but every result was already in the cache (or GD found
  // nothing). Distinct from a failure — the user consented to a network call
  // and it worked; there is just nothing new. `totalFound` is the pre-dedupe
  // count so the client can say "all N are already cached".
  | { status: 'nothing_new'; totalFound: number }
  // The RobTop call itself couldn't complete — retryable.
  | { status: 'unreachable' }

// Maps a parsed RobTop level to the same row shape the cache search returns, so
// result rows render identically regardless of source.
function toRow(inGameId: string, level: RobtopLevel): LevelSearchResult {
  return {
    inGameId,
    name: level.name,
    creator: level.creator,
    songName: level.songName,
    inGameDifficulty: level.inGameDifficulty,
    stars: level.stars,
    featured: level.featured,
    epicValue: level.epicValue,
    isRated: level.isRated,
  }
}

export async function runGdSearch(
  q: string,
  filters: LevelSearchFilters = {},
  sort: LevelSort = 'relevance'
): Promise<GdSearchOutcome> {
  const trimmed = q.trim()
  const params = buildRobtopParams(filters, sort, trimmed.length > 0)
  const outcome = await searchRobtopByNameResult(trimmed, params)
  if (outcome.status === 'unreachable') return { status: 'unreachable' }

  const results = outcome.results
  const totalFound = results.length
  if (totalFound === 0) return { status: 'nothing_new', totalFound: 0 }

  // Drop anything already in the cache — those levels were already shown from
  // the cache results above; repeating them would encourage escalating for
  // levels we already hold.
  const ids = results.map((r) => r.levelId)
  const cached = await prisma.level.findMany({
    where: { inGameId: { in: ids } },
    select: { inGameId: true },
  })
  const cachedIds = new Set(cached.map((c) => c.inGameId))
  const survivors = results.filter((r) => !cachedIds.has(r.levelId))

  if (survivors.length === 0) return { status: 'nothing_new', totalFound }

  const rated = survivors.filter((r) => r.level.isRated)
  const unrated = survivors.filter((r) => !r.level.isRated)

  // Seed rated survivors automatically. Data is already in hand from the search
  // response — no extra RobTop calls. upsert (not create) guards against a
  // concurrent seed of the same id; the empty update keeps the existing row.
  await Promise.all(
    rated.map((r) =>
      prisma.level.upsert({
        where: { inGameId: r.levelId },
        create: buildRobtopCreateData(r.levelId, r.level),
        update: {},
      })
    )
  )

  return {
    status: 'ok',
    rated: rated.map((r) => toRow(r.levelId, r.level)),
    unrated: unrated.map((r) => toRow(r.levelId, r.level)),
  }
}
