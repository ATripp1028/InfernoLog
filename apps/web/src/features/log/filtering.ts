// Pure filter/sort logic for the Log page. All data is client-side, so this is
// plain array work over LevelProgressListItem rows. Kept framework-free.

import type {
  FilterState,
  LogItem,
  Range,
  RatedStatusFilter,
  SortKey,
  SortSpec,
  StatusFlag,
} from './types'
import {
  ATTEMPTS_DOMAIN,
  ENJOYMENT_DOMAIN,
  RATING_DOMAIN,
  TIER_DOMAIN,
} from './types'

/**
 * A row's GDDL tier, or `null` when the user has logged no tier opinion for it.
 */
export function gddlTier(item: LogItem): number | null {
  return item.userGddlTier ?? null
}

function dateMs(item: LogItem): number | null {
  const d = item.entry?.date
  if (!d) return null
  const ms = new Date(d).getTime()
  return Number.isFinite(ms) ? ms : null
}

function matchesRatedStatus(item: LogItem, status: RatedStatusFilter): boolean {
  const { isRated, featured, epicValue } = item.level
  switch (status) {
    case 'ALL':
      return true
    case 'UNRATED':
      return !isRated
    case 'RATED':
      return isRated
    case 'FEATURED':
      return featured === true
    case 'EPIC':
      return epicValue === 1
    case 'LEGENDARY':
      return epicValue === 2
    case 'MYTHIC':
      return epicValue === 3
  }
}

function flagValue(item: LogItem, flag: StatusFlag): boolean {
  switch (flag) {
    case 'hasVideo':
      return Boolean(item.entry?.videoUrl)
    case 'onStream':
      return Boolean(item.entry?.onStream)
    case 'uncertainDate':
      return Boolean(item.entry?.dateUncertain)
    case 'needsPlacement':
      return item.needsPlacement
    case 'twoPlayer':
      return Boolean(item.level.twoPlayer)
    case 'hasCoins':
      return (item.level.coins ?? 0) > 0
    case 'verifiedCoins':
      return Boolean(item.level.coinsVerified)
  }
}

// Order for sorting GD level lengths (unknown values sort last).
const LENGTH_ORDER: Record<string, number> = {
  Tiny: 0,
  Short: 1,
  Medium: 2,
  Long: 3,
  XL: 4,
  Platformer: 5,
}

// In-game difficulty ordering (easy → hard), used for sorting and for ordering
// the difficulty filter chips. Unknown/unrated values sort last.
const DIFFICULTY_ORDER: Record<string, number> = {
  Auto: 0,
  Easy: 1,
  Normal: 2,
  Hard: 3,
  Harder: 4,
  Insane: 5,
  'Easy Demon': 6,
  'Medium Demon': 7,
  'Hard Demon': 8,
  'Insane Demon': 9,
  'Extreme Demon': 10,
}

/**
 * A sortable rank for an in-game difficulty string, since the labels do not sort alphabetically into game order.
 */
export function difficultyRank(difficulty: string | null): number | null {
  if (!difficulty) return null
  return DIFFICULTY_ORDER[difficulty] ?? null
}

/**
 * Whether a range actually constrains anything — `false` when it still equals its full domain.
 */
export function isRangeActive(range: Range, domain: Range): boolean {
  return range[0] > domain[0] || range[1] < domain[1]
}

function inRange(value: number, [min, max]: Range): boolean {
  return value >= min && value <= max
}

const clamp = (v: number, [min, max]: Range): number =>
  Math.min(max, Math.max(min, v))

/**
 * Every filter in {@link FilterState} applied to the rows, in one pass.
 */
export function applyFilters(
  items: LogItem[],
  filters: FilterState,
  search: string
): LogItem[] {
  const q = search.trim().toLowerCase()
  const ratingActive = isRangeActive(filters.rating, RATING_DOMAIN)
  const enjoyActive = isRangeActive(filters.enjoyment, ENJOYMENT_DOMAIN)
  const tierActive = isRangeActive(filters.tier, TIER_DOMAIN)
  const attemptsActive = isRangeActive(filters.attempts, ATTEMPTS_DOMAIN)
  const { from: dateFrom, to: dateTo } = filters.dateBeaten
  const dateActive = dateFrom != null || dateTo != null

  // Pre-compute active category rating filters.
  const activeCatFilters = Object.entries(filters.categoryRatings ?? {}).filter(
    ([, range]) => isRangeActive(range, RATING_DOMAIN)
  )

  return items.filter((item) => {
    if (q) {
      // Search matches name, creator, level id, and song name/artist.
      const haystack = [
        item.level.name,
        item.level.creator,
        item.level.inGameId,
        item.level.songName,
        item.level.songAuthor,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }

    if (filters.statuses.length && !filters.statuses.includes(item.status))
      return false

    if (
      filters.lengths.length &&
      !(item.level.length && filters.lengths.includes(item.level.length))
    )
      return false

    if (
      filters.gameVersions.length &&
      !(
        item.level.gameVersion &&
        filters.gameVersions.includes(item.level.gameVersion)
      )
    )
      return false

    if (
      filters.difficulties.length &&
      !(
        item.level.inGameDifficulty &&
        filters.difficulties.includes(item.level.inGameDifficulty)
      )
    )
      return false

    if (
      filters.levelTypes.length &&
      !filters.levelTypes.includes(item.level.levelType)
    )
      return false

    if (filters.devices.length) {
      const d = item.entry?.device ?? null
      if (!d || !filters.devices.includes(d as 'pc' | 'mobile')) return false
    }

    if (!matchesRatedStatus(item, filters.ratedStatus)) return false

    if (filters.flags.length && !filters.flags.every((f) => flagValue(item, f)))
      return false

    if (ratingActive) {
      const r = item.overallRating
      if (r == null || !inRange(r, filters.rating)) return false
    }

    if (enjoyActive) {
      const e = item.entry?.enjoyment
      if (e == null || !inRange(e, filters.enjoyment)) return false
    }

    if (tierActive) {
      const t = gddlTier(item)
      if (t == null || !inRange(clamp(t, TIER_DOMAIN), filters.tier))
        return false
    }

    if (attemptsActive) {
      const a = item.entry?.attempts
      if (a == null || !inRange(clamp(a, ATTEMPTS_DOMAIN), filters.attempts))
        return false
    }

    if (dateActive) {
      const d = dateMs(item)
      if (d == null) return false
      if (dateFrom != null && d < dateFrom) return false
      if (dateTo != null && d > dateTo) return false
    }

    for (const [catId, range] of activeCatFilters) {
      const score = item.ratingScores.find((r) => r.categoryId === catId)?.score
      if (score == null || !inRange(score, range)) return false
    }

    return true
  })
}

/**
 * Number of constraining filter groups — drives the "Filters · N" badge.
 */
export function countActiveFilters(filters: FilterState): number {
  let n = 0
  if (filters.statuses.length) n++
  if (filters.levelTypes.length) n++
  if (filters.devices.length) n++
  if (filters.ratedStatus !== 'ALL') n++
  if (filters.flags.length) n++
  if (filters.lengths.length) n++
  if (filters.gameVersions.length) n++
  if (filters.difficulties.length) n++
  if (isRangeActive(filters.rating, RATING_DOMAIN)) n++
  if (isRangeActive(filters.enjoyment, ENJOYMENT_DOMAIN)) n++
  if (isRangeActive(filters.tier, TIER_DOMAIN)) n++
  if (isRangeActive(filters.attempts, ATTEMPTS_DOMAIN)) n++
  if (filters.dateBeaten.from != null || filters.dateBeaten.to != null) n++
  for (const range of Object.values(filters.categoryRatings ?? {})) {
    if (isRangeActive(range, RATING_DOMAIN)) n++
  }
  return n
}

// ── Sorting ──────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<LogItem['status'], number> = {
  COMPLETED: 0,
  IN_PROGRESS: 1,
  DROPPED: 2,
}

function sortValue(item: LogItem, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return item.level.name?.toLowerCase() ?? null
    case 'date':
      return dateMs(item)
    case 'attempts':
      return item.entry?.attempts ?? null
    case 'rating':
      return item.overallRating ?? null
    case 'enjoyment':
      return item.entry?.enjoyment ?? null
    case 'tier':
      return gddlTier(item)
    case 'status':
      return STATUS_ORDER[item.status]
    case 'id':
      return Number.parseInt(item.level.inGameId, 10)
    case 'length':
      return item.level.length != null
        ? (LENGTH_ORDER[item.level.length] ?? null)
        : null
    case 'songName':
      return item.level.songName?.toLowerCase() ?? null
    case 'songArtist':
      return item.level.songAuthor?.toLowerCase() ?? null
    case 'coins':
      return item.level.coins ?? null
    case 'gameVersion': {
      const v = item.level.gameVersion
      if (!v) return null
      const n = Number.parseFloat(v)
      return Number.isFinite(n) ? n : v.toLowerCase()
    }
    case 'twoPlayer':
      return item.level.twoPlayer ? 1 : 0
    case 'creator':
      return item.level.creator?.toLowerCase() ?? null
    case 'difficulty':
      return difficultyRank(item.level.inGameDifficulty)
    default: {
      // `cat:${categoryId}` — return the individual category score.
      if (key.startsWith('cat:')) {
        const catId = key.slice(4)
        return (
          item.ratingScores.find((r) => r.categoryId === catId)?.score ?? null
        )
      }
      return null
    }
  }
}

function compareValues(
  a: number | string | null,
  b: number | string | null,
  dir: 'asc' | 'desc'
): number {
  // Nulls always sort last, regardless of direction.
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  let cmp: number
  if (typeof a === 'string' && typeof b === 'string') cmp = a.localeCompare(b)
  else cmp = (a as number) - (b as number)
  return dir === 'asc' ? cmp : -cmp
}

/**
 * Minimal category info needed for tie-breaking; avoids importing API types.
 */
export interface RatingCategoryTiebreaker {
  id: string
  sortOrder: number
}

/**
 * Stable multi-key sort: specs are applied in priority order.
 * When sorting by 'rating' with ratingCategories provided, ties in the weighted
 * average are broken by category score in priority order (lowest sortOrder first).
 */
export function sortItems(
  items: LogItem[],
  sorts: SortSpec[],
  ratingCategories?: RatingCategoryTiebreaker[]
): LogItem[] {
  if (!sorts.length) return items
  // Pre-sort categories by priority (lowest sortOrder = highest priority).
  const tiebreakerCats = ratingCategories
    ? [...ratingCategories].sort((a, b) => a.sortOrder - b.sortOrder)
    : []
  return [...items].sort((x, y) => {
    for (const spec of sorts) {
      let cmp = compareValues(
        sortValue(x, spec.key),
        sortValue(y, spec.key),
        spec.dir
      )
      // Break weighted-rating ties by category priority order.
      if (cmp === 0 && spec.key === 'rating' && tiebreakerCats.length > 0) {
        for (const cat of tiebreakerCats) {
          const aScore =
            x.ratingScores.find((r) => r.categoryId === cat.id)?.score ?? null
          const bScore =
            y.ratingScores.find((r) => r.categoryId === cat.id)?.score ?? null
          cmp = compareValues(aScore, bScore, spec.dir)
          if (cmp !== 0) break
        }
      }
      if (cmp !== 0) return cmp
    }
    return 0
  })
}
