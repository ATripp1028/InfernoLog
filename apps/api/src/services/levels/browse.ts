// Cursor-paginated, filtered cache search backing the /search page's results
// grid (GET /v1/levels/browse). Unlike GET /v1/levels/search (the lightweight
// 20-row autocomplete), this supports the full filter set, several sort orders,
// and keyset pagination over the whole levels cache.
//
// Keyset pagination: rows are ordered by the chosen sort expression then
// "inGameId" as a stable tiebreaker. The opaque cursor carries the last row's
// sort value + inGameId; the next page's WHERE re-anchors on that pair. Nullable
// sort columns are COALESCEd to a sentinel picked per direction so NULLs sort
// last whichever way the user orders, and never break the keyset comparison.

import { Prisma } from '@prisma/client'
import prisma from '../../utils/prisma'
import { resolveLevelDifficulty } from './difficulty'
import { LEVEL_RANGE_FIELDS } from '@infernolog/core'
import type {
  LevelBrowseQuery,
  LevelBrowseResult,
  LevelRangeField,
  LevelSort,
} from '@infernolog/core'

const PAGE_SIZE = 30

type Dir = 'ASC' | 'DESC'

// Filter length token → the label as stored on Level.length.
const LENGTH_LABELS: Record<string, string> = {
  tiny: 'Tiny',
  short: 'Short',
  medium: 'Medium',
  long: 'Long',
  xl: 'XL',
}

// Difficulty face rank from Level.partialDiff — the canonical GD difficulty
// order (Auto < Easy < … < Insane < Easy Demon < … < Extreme Demon). Drives the
// 'stars' sort's primary key so results order by face first; star count only
// breaks convention on RobTop's official levels, so it's the tiebreaker.
const DIFFICULTY_RANK = Prisma.sql`(CASE "partialDiff"
  WHEN 'demon-extreme' THEN 11
  WHEN 'demon-insane' THEN 10
  WHEN 'demon-hard' THEN 9
  WHEN 'demon-medium' THEN 8
  WHEN 'demon-easy' THEN 7
  WHEN 'insane' THEN 6
  WHEN 'harder' THEN 5
  WHEN 'hard' THEN 4
  WHEN 'normal' THEN 3
  WHEN 'easy' THEN 2
  WHEN 'auto' THEN 1
  ELSE 0 END)`

// Level.gameVersion as a comparable number ("2.1" → 2.1), NULL for anything not
// shaped like a version. formatGameVersion writes a single-digit minor, so the
// decimal order is the release order.
const GAME_VERSION_NUM = Prisma.sql`(CASE WHEN "gameVersion" ~ '^[0-9]+[.][0-9]+$' THEN "gameVersion"::float8 END)`

// Duration in seconds, falling back to the lower bound of RobTop's length band
// (Tiny <10s, Short <30s, Medium <60s, Long <120s, XL 120s+) where the exact
// duration is unknown. The lower bound is the one figure the band guarantees,
// so an unknown XL sorts at 120s — below every XL whose real length is known to
// be longer, never above one it might be shorter than. Platformer rows have no
// band and stay NULL.
const DURATION_WITH_FALLBACK = Prisma.sql`COALESCE("durationSeconds", CASE "length"
  WHEN 'Tiny' THEN 0
  WHEN 'Short' THEN 10
  WHEN 'Medium' THEN 30
  WHEN 'Long' THEN 60
  WHEN 'XL' THEN 120
  END)`

// The column (or derived value) each range filter bounds. `duration` bounds the
// exact figure only — the length band is a sort fallback, not a filter one.
const RANGE_COLUMNS: Record<LevelRangeField, Prisma.Sql> = {
  downloads: Prisma.sql`"downloads"`,
  likes: Prisma.sql`"likes"`,
  objectCount: Prisma.sql`"objectCount"`,
  gddlTier: Prisma.sql`"gddlTier"`,
  aredlRank: Prisma.sql`"aredlRank"`,
  enjoyment: Prisma.sql`"enjoyment"`,
  duration: Prisma.sql`"durationSeconds"`,
  gameVersion: GAME_VERSION_NUM,
}

// What a bound on a field implies beyond the comparison itself. An AREDL
// position is only a rank on the main list: Legacy is appended after it as a
// list index (MainList 1-1573, Legacy 1574+), so a rank bound matches main-list
// placements only. A rank with no status came from the Global Stats Viewer,
// which only ever reports main-list placements, so it counts as ranked.
const RANGE_GUARDS: Partial<Record<LevelRangeField, Prisma.Sql>> = {
  aredlRank: Prisma.sql`("aredlStatus" IS NULL OR "aredlStatus" = 'MainList')`,
}

// Song provenance for the result row, with the songType filter's predicates in
// its order: an official track, else a NONG (which still carries its
// placeholder songId), else a Newgrounds song.
const SONG_TYPE = Prisma.sql`(CASE WHEN "officialSongId" IS NOT NULL THEN 'official' WHEN "isNong" THEN 'nong' WHEN "songId" IS NOT NULL THEN 'custom' END)`

// A nullable numeric expression with NULLs pushed past every real value in the
// given direction. The sentinels are finite so they survive the JSON cursor.
function nullsLast(col: Prisma.Sql, dir: Dir): Prisma.Sql {
  return dir === 'DESC'
    ? Prisma.sql`(COALESCE(${col}, -1e18))::float8`
    : Prisma.sql`(COALESCE(${col}, 1e18))::float8`
}

interface SortDef {
  // The (non-null) ordering expression, reused verbatim in SELECT, WHERE, and
  // ORDER BY so the keyset comparison stays consistent with the sort.
  expr: Prisma.Sql
  type: 'num' | 'text'
}

// The direction used when the request doesn't override sortDir: names read A→Z,
// AREDL rank 1 is the hardest, and level IDs run oldest-first, so those start
// ascending; every other sort is more useful highest-first.
function naturalDir(sort: LevelSort): Dir {
  return sort === 'name' || sort === 'aredlRank' || sort === 'levelId'
    ? 'ASC'
    : 'DESC'
}

function sortDef(
  sort: LevelSort,
  dir: Dir,
  q: string,
  searchBy: string
): SortDef {
  const rel =
    searchBy === 'creator'
      ? Prisma.sql`similarity(COALESCE("creator", ''), ${q})`
      : Prisma.sql`similarity(COALESCE("name", ''), ${q})`
  switch (sort) {
    case 'relevance':
      return { expr: Prisma.sql`(${rel})::float8`, type: 'num' }
    case 'levelId':
      // Numeric, not lexical — "99" is older than "100". Ids are digits-only
      // (LevelIdSchema); the guard keeps one malformed row from failing the
      // cast for the whole query.
      return {
        expr: nullsLast(
          Prisma.sql`(CASE WHEN "inGameId" ~ '^[0-9]+$' THEN "inGameId"::float8 END)`,
          dir
        ),
        type: 'num',
      }
    // Descending downloads/likes keep their original -1 sentinel, literally:
    // the expression indexes from migration 20260804000100 are built on exactly
    // `(COALESCE(col, -1))::float8`, and a different sentinel is a different
    // expression the planner will not match to them.
    case 'likes':
      return {
        expr:
          dir === 'DESC'
            ? Prisma.sql`(COALESCE("likes", -1))::float8`
            : nullsLast(Prisma.sql`"likes"`, dir),
        type: 'num',
      }
    case 'downloads':
      return {
        expr:
          dir === 'DESC'
            ? Prisma.sql`(COALESCE("downloads", -1))::float8`
            : nullsLast(Prisma.sql`"downloads"`, dir),
        type: 'num',
      }
    case 'stars':
      // Difficulty face first (× 1000), star count as the tiebreaker.
      return {
        expr: Prisma.sql`((${DIFFICULTY_RANK}) * 1000 + COALESCE("stars", 0))::float8`,
        type: 'num',
      }
    case 'gddlTier':
      return { expr: nullsLast(Prisma.sql`"gddlTier"`, dir), type: 'num' }
    case 'aredlRank':
      return { expr: nullsLast(Prisma.sql`"aredlRank"`, dir), type: 'num' }
    case 'sheetTier':
      // Tier 0 is a real placement but not an easier one — it holds levels too
      // niche to rank — so it sorts after every ranked tier in either
      // direction, ahead of levels with no placement at all.
      return {
        expr:
          dir === 'DESC'
            ? Prisma.sql`(CASE WHEN "sheetTier" IS NULL THEN -2 WHEN "sheetTier" = 0 THEN -1 ELSE "sheetTier" END)::float8`
            : Prisma.sql`(CASE WHEN "sheetTier" IS NULL THEN 1001 WHEN "sheetTier" = 0 THEN 1000 ELSE "sheetTier" END)::float8`,
        type: 'num',
      }
    case 'enjoyment':
      return { expr: nullsLast(Prisma.sql`"enjoyment"`, dir), type: 'num' }
    case 'duration':
      return { expr: nullsLast(DURATION_WITH_FALLBACK, dir), type: 'num' }
    case 'objectCount':
      return { expr: nullsLast(Prisma.sql`"objectCount"`, dir), type: 'num' }
    case 'gameVersion':
      return { expr: nullsLast(GAME_VERSION_NUM, dir), type: 'num' }
    case 'recentlyRated':
      return {
        expr: nullsLast(
          Prisma.sql`EXTRACT(EPOCH FROM "ratingStatusSince")`,
          dir
        ),
        type: 'num',
      }
    case 'name':
      return { expr: Prisma.sql`LOWER(COALESCE("name", ''))`, type: 'text' }
  }
}

function encodeCursor(v: number | string, id: string): string {
  return Buffer.from(JSON.stringify({ v, id })).toString('base64')
}

function decodeCursor(c: string): { v: number | string; id: string } | null {
  try {
    const o = JSON.parse(Buffer.from(c, 'base64').toString('utf8')) as unknown
    if (
      o &&
      typeof o === 'object' &&
      'id' in o &&
      typeof (o as { id: unknown }).id === 'string' &&
      'v' in o &&
      (typeof (o as { v: unknown }).v === 'number' ||
        typeof (o as { v: unknown }).v === 'string')
    ) {
      return o as { v: number | string; id: string }
    }
  } catch {
    // Malformed cursor — treat as no cursor (start from the first page).
  }
  return null
}

/**
 * The /search page's filtered, keyset-paginated search over the levels cache.
 *
 * Never calls the GD servers — escalating to those is the separate, opt-in
 * {@link runGdSearch}. Pagination is keyset (sort value + inGameId tiebreak)
 * rather than OFFSET, so deep pages stay cheap and a row inserted mid-scroll
 * can't shift the window.
 *
 * @param query - Validated filters, sort, direction, and opaque cursor. A
 * `relevance` sort with no query term falls back to `downloads`, the natural
 * default for "browse the cache by filter". A digits-only name query also
 * matches that exact level ID.
 * @param scope - Narrows the browse to one collection's levels. The caller
 * owns the ownership check — this only filters.
 * @returns One page of rows plus `nextCursor`, which is null on the last page.
 */
export async function browseLevels(
  query: LevelBrowseQuery,
  scope: { collectionId?: string } = {}
): Promise<{ data: LevelBrowseResult[]; nextCursor: string | null }> {
  const { searchBy, cursor } = query
  const trimmed = query.q?.trim() ?? ''
  // Relevance needs a query term; with an empty query fall back to downloads
  // (the common "browse the cache by filter" default).
  const sort: LevelSort =
    query.sort === 'relevance' && trimmed.length === 0
      ? 'downloads'
      : query.sort

  const conds: Prisma.Sql[] = []

  if (scope.collectionId) {
    conds.push(
      Prisma.sql`"inGameId" IN (SELECT "levelId" FROM "collection_entries" WHERE "collectionId" = ${scope.collectionId})`
    )
  }

  if (trimmed.length > 0) {
    // Escape ILIKE wildcards so a literal "100%" matches literally.
    const likePattern = `%${trimmed.replace(/[\\%_]/g, '\\$&')}%`
    const col =
      searchBy === 'creator' ? Prisma.sql`"creator"` : Prisma.sql`"name"`
    const text = Prisma.sql`${col} ILIKE ${likePattern} OR ${col} % ${trimmed}`
    // The /search bar turns a number into a jump to that level's page, so this
    // only matters where a number is a browse term — a collection's own bar.
    conds.push(
      searchBy === 'name' && /^\d+$/.test(trimmed)
        ? Prisma.sql`("inGameId" = ${trimmed} OR ${text})`
        : Prisma.sql`(${text})`
    )
  }

  if (query.difficulty?.length) {
    conds.push(Prisma.sql`"partialDiff" IN (${Prisma.join(query.difficulty)})`)
  }

  if (query.rateStatus?.length) {
    const rs = query.rateStatus.map((s) => {
      switch (s) {
        case 'unrated':
          return Prisma.sql`"isRated" = false`
        case 'rated':
          return Prisma.sql`"isRated" = true`
        case 'featured':
          return Prisma.sql`"featured" = true`
        case 'epic':
          return Prisma.sql`"epicValue" = 1`
        case 'legendary':
          return Prisma.sql`"epicValue" = 2`
        case 'mythic':
          return Prisma.sql`"epicValue" = 3`
      }
    })
    conds.push(Prisma.sql`(${Prisma.join(rs, ' OR ')})`)
  }

  if (query.twoPlayer !== undefined) {
    conds.push(Prisma.sql`"twoPlayer" = ${query.twoPlayer}`)
  }
  if (query.coinCount?.length) {
    conds.push(Prisma.sql`"coins" IN (${Prisma.join(query.coinCount)})`)
  }
  if (query.coinsVerified !== undefined) {
    conds.push(Prisma.sql`"coinsVerified" = ${query.coinsVerified}`)
  }
  if (query.length?.length) {
    const labels = query.length.map((l) => LENGTH_LABELS[l])
    conds.push(Prisma.sql`"length" IN (${Prisma.join(labels)})`)
  }
  if (query.levelType) {
    conds.push(Prisma.sql`"levelType"::text = ${query.levelType}`)
  }
  if (query.songType) {
    conds.push(
      query.songType === 'official'
        ? Prisma.sql`"officialSongId" IS NOT NULL`
        : query.songType === 'nong'
          ? Prisma.sql`"isNong" = true`
          : Prisma.sql`("songId" IS NOT NULL AND "isNong" = false)`
    )
  }
  if (query.sheetTier !== undefined) {
    conds.push(Prisma.sql`"sheetTier" = ${query.sheetTier}`)
  }

  // Inclusive range bounds. A NULL column never satisfies a comparison, so any
  // bound on a field also drops the levels where that field is unknown.
  for (const field of LEVEL_RANGE_FIELDS) {
    const col = RANGE_COLUMNS[field]
    const min = query[`${field}Min` as const]
    const max = query[`${field}Max` as const]
    if (min !== undefined) conds.push(Prisma.sql`${col} >= ${min}`)
    if (max !== undefined) conds.push(Prisma.sql`${col} <= ${max}`)
    const guard = RANGE_GUARDS[field]
    if (guard && (min !== undefined || max !== undefined)) conds.push(guard)
  }

  const dir: Dir =
    query.sortDir === 'asc'
      ? 'ASC'
      : query.sortDir === 'desc'
        ? 'DESC'
        : naturalDir(sort)
  const s = sortDef(sort, dir, trimmed, searchBy)

  if (cursor) {
    const dec = decodeCursor(cursor)
    if (dec) {
      const cmp = dir === 'DESC' ? Prisma.sql`<` : Prisma.sql`>`
      const vparam =
        s.type === 'num'
          ? Prisma.sql`${Number(dec.v)}::float8`
          : Prisma.sql`${String(dec.v)}`
      conds.push(
        Prisma.sql`((${s.expr}) ${cmp} ${vparam} OR ((${s.expr}) = ${vparam} AND "inGameId" > ${dec.id}))`
      )
    }
  }

  const whereSql = conds.length
    ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}`
    : Prisma.empty
  const dirSql = dir === 'DESC' ? Prisma.sql`DESC` : Prisma.sql`ASC`

  // Fetch one extra row to know whether a further page exists without a second
  // round-trip (and without emitting a phantom empty final page).
  const rows = await prisma.$queryRaw<
    Array<LevelBrowseResult & { _sortval: number | string }>
  >(Prisma.sql`
    SELECT "inGameId", "name", "creator", "songName", "inGameDifficulty",
           "stars", "featured", "epicValue", "isRated",
           "likes", "downloads", "length", "coins", "coinsVerified",
           "twoPlayer", "isDemon", "levelType",
           "objectCount", "gddlTier", "aredlRank", "aredlStatus", "sheetTier",
           "enjoyment"::float8 AS "enjoyment", "durationSeconds",
           "gameVersion", "ratingStatusSince",
           ${SONG_TYPE} AS "songType",
           (${s.expr}) AS "_sortval"
    FROM "levels"
    ${whereSql}
    ORDER BY (${s.expr}) ${dirSql}, "inGameId" ASC
    LIMIT ${PAGE_SIZE + 1}
  `)

  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const last = page[page.length - 1]
  const nextCursor =
    hasMore && last ? encodeCursor(last._sortval, last.inGameId) : null

  const data = page.map((row): LevelBrowseResult => {
    // Strip the internal keyset value; the rest is the wire row, except that a
    // non-demon's difficulty is keyed on "stars", which outranks the stored
    // label (see starDifficulty.ts).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _sortval, ...rest } = row
    return { ...rest, inGameDifficulty: resolveLevelDifficulty(rest) }
  })
  return { data, nextCursor }
}
