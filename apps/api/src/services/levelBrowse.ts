// Cursor-paginated, filtered cache search backing the /search page's results
// grid (GET /v1/levels/browse). Unlike GET /v1/levels/search (the lightweight
// 20-row autocomplete), this supports the full filter set, several sort orders,
// and keyset pagination over the whole levels cache.
//
// Keyset pagination: rows are ordered by the chosen sort expression then
// "inGameId" as a stable tiebreaker. The opaque cursor carries the last row's
// sort value + inGameId; the next page's WHERE re-anchors on that pair. Nullable
// sort columns are COALESCEd to a sentinel that sorts last so NULLs never break
// the keyset comparison.

import { Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import type {
  LevelBrowseQuery,
  LevelBrowseResult,
  LevelSort,
} from '@infernolog/core'

const PAGE_SIZE = 30

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

interface SortDef {
  // The (non-null) ordering expression, reused verbatim in SELECT, WHERE, and
  // ORDER BY so the keyset comparison stays consistent with the sort.
  expr: Prisma.Sql
  // The direction used when the request doesn't override sortDir.
  naturalDir: 'ASC' | 'DESC'
  type: 'num' | 'text'
}

function sortDef(sort: LevelSort, q: string, searchBy: string): SortDef {
  const rel =
    searchBy === 'creator'
      ? Prisma.sql`similarity(COALESCE("creator", ''), ${q})`
      : Prisma.sql`similarity(COALESCE("name", ''), ${q})`
  switch (sort) {
    case 'relevance':
      return {
        expr: Prisma.sql`(${rel})::float8`,
        naturalDir: 'DESC',
        type: 'num',
      }
    case 'likes':
      return {
        expr: Prisma.sql`(COALESCE("likes", -1))::float8`,
        naturalDir: 'DESC',
        type: 'num',
      }
    case 'downloads':
      return {
        expr: Prisma.sql`(COALESCE("downloads", -1))::float8`,
        naturalDir: 'DESC',
        type: 'num',
      }
    case 'stars':
      // Difficulty face first (× 1000), star count as the tiebreaker.
      return {
        expr: Prisma.sql`((${DIFFICULTY_RANK}) * 1000 + COALESCE("stars", 0))::float8`,
        naturalDir: 'DESC',
        type: 'num',
      }
    case 'objectCount':
      return {
        expr: Prisma.sql`(COALESCE("objectCount", -1))::float8`,
        naturalDir: 'DESC',
        type: 'num',
      }
    case 'recentlyRated':
      return {
        expr: Prisma.sql`(EXTRACT(EPOCH FROM COALESCE("ratingStatusSince", 'epoch')))::float8`,
        naturalDir: 'DESC',
        type: 'num',
      }
    case 'name':
      return {
        expr: Prisma.sql`LOWER(COALESCE("name", ''))`,
        naturalDir: 'ASC',
        type: 'text',
      }
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

export async function browseLevels(
  query: LevelBrowseQuery
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

  if (trimmed.length > 0) {
    // Escape ILIKE wildcards so a literal "100%" matches literally.
    const likePattern = `%${trimmed.replace(/[\\%_]/g, '\\$&')}%`
    const col =
      searchBy === 'creator' ? Prisma.sql`"creator"` : Prisma.sql`"name"`
    conds.push(Prisma.sql`(${col} ILIKE ${likePattern} OR ${col} % ${trimmed})`)
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

  const s = sortDef(sort, trimmed, searchBy)
  const dir: 'ASC' | 'DESC' =
    query.sortDir === 'asc'
      ? 'ASC'
      : query.sortDir === 'desc'
        ? 'DESC'
        : s.naturalDir

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
    // Strip the internal keyset value; the rest is the wire row.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _sortval, ...rest } = row
    return rest
  })
  return { data, nextCursor }
}
