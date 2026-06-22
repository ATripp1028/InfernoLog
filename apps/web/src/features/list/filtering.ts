// Pure filter/sort logic for the List page. All data is client-side, so this is
// plain array work over LevelProgressListItem rows. Kept framework-free.

import type {
  FilterState,
  ListItem,
  Range,
  RatedStatusFilter,
  SortKey,
  SortSpec,
  StatusFlag,
} from './types'
import {
  ATTEMPTS_DOMAIN,
  DATE_MIN_MS,
  ENJOYMENT_DOMAIN,
  RATING_DOMAIN,
  TIER_DOMAIN,
} from './types'

const DAY_MS = 86_400_000

// The date domain's max is "now" (changes constantly), so detect activity with a
// one-day tolerance at both ends rather than exact domain equality.
function isDateActive(range: Range): boolean {
  return range[0] > DATE_MIN_MS + DAY_MS || range[1] < Date.now() - DAY_MS
}

// ── Row value extractors ─────────────────────────────────────────────────────

export function gddlTier(item: ListItem): number | null {
  const ref = item.entry?.listReferences.find((r) => r.listSource === 'GDDL')
  if (!ref) return null
  const n = Number.parseInt(ref.tierOrRank, 10)
  return Number.isFinite(n) ? n : null
}

function dateMs(item: ListItem): number | null {
  const d = item.entry?.date
  if (!d) return null
  const ms = new Date(d).getTime()
  return Number.isFinite(ms) ? ms : null
}

function matchesRatedStatus(item: ListItem, status: RatedStatusFilter): boolean {
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

function flagValue(item: ListItem, flag: StatusFlag): boolean {
  switch (flag) {
    case 'hasVideo':
      return Boolean(item.entry?.videoUrl)
    case 'onStream':
      return Boolean(item.entry?.onStream)
    case 'uncertainDate':
      return Boolean(item.entry?.dateUncertain)
    case 'needsPlacement':
      return item.needsPlacement
  }
}

// ── Range helpers ────────────────────────────────────────────────────────────

export function isRangeActive(range: Range, domain: Range): boolean {
  return range[0] > domain[0] || range[1] < domain[1]
}

function inRange(value: number, [min, max]: Range): boolean {
  return value >= min && value <= max
}

const clamp = (v: number, [min, max]: Range): number =>
  Math.min(max, Math.max(min, v))

// ── Filtering ────────────────────────────────────────────────────────────────

export function applyFilters(
  items: ListItem[],
  filters: FilterState,
  search: string
): ListItem[] {
  const q = search.trim().toLowerCase()
  const ratingActive = isRangeActive(filters.rating, RATING_DOMAIN)
  const enjoyActive = isRangeActive(filters.enjoyment, ENJOYMENT_DOMAIN)
  const tierActive = isRangeActive(filters.tier, TIER_DOMAIN)
  const attemptsActive = isRangeActive(filters.attempts, ATTEMPTS_DOMAIN)
  const dateActive = isDateActive(filters.dateBeaten)

  return items.filter((item) => {
    if (q) {
      const name = item.level.name?.toLowerCase() ?? ''
      const creator = item.level.creator?.toLowerCase() ?? ''
      if (!name.includes(q) && !creator.includes(q)) return false
    }

    if (filters.statuses.length && !filters.statuses.includes(item.status))
      return false

    if (
      filters.levelTypes.length &&
      !filters.levelTypes.includes(item.level.levelType)
    )
      return false

    if (filters.listSources.length) {
      const refs = item.entry?.listReferences ?? []
      const hasAny = filters.listSources.some((src) =>
        refs.some((r) => r.listSource === src)
      )
      if (!hasAny) return false
    }

    if (!matchesRatedStatus(item, filters.ratedStatus)) return false

    if (filters.flags.length && !filters.flags.every((f) => flagValue(item, f)))
      return false

    if (ratingActive) {
      const r = item.entry?.overallRating
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
      if (d == null || !inRange(d, filters.dateBeaten)) return false
    }

    return true
  })
}

// Number of constraining filter groups — drives the "Filters · N" badge.
export function countActiveFilters(filters: FilterState): number {
  let n = 0
  if (filters.statuses.length) n++
  if (filters.listSources.length) n++
  if (filters.levelTypes.length) n++
  if (filters.ratedStatus !== 'ALL') n++
  if (filters.flags.length) n++
  if (isRangeActive(filters.rating, RATING_DOMAIN)) n++
  if (isRangeActive(filters.enjoyment, ENJOYMENT_DOMAIN)) n++
  if (isRangeActive(filters.tier, TIER_DOMAIN)) n++
  if (isRangeActive(filters.attempts, ATTEMPTS_DOMAIN)) n++
  if (isDateActive(filters.dateBeaten)) n++
  return n
}

// ── Sorting ──────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<ListItem['status'], number> = {
  COMPLETED: 0,
  IN_PROGRESS: 1,
  DROPPED: 2,
}

function sortValue(item: ListItem, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return item.level.name?.toLowerCase() ?? null
    case 'date':
      return dateMs(item)
    case 'attempts':
      return item.entry?.attempts ?? null
    case 'rating':
      return item.entry?.overallRating ?? null
    case 'enjoyment':
      return item.entry?.enjoyment ?? null
    case 'tier':
      return gddlTier(item)
    case 'status':
      return STATUS_ORDER[item.status]
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

// Stable multi-key sort: specs are applied in priority order.
export function sortItems(items: ListItem[], sorts: SortSpec[]): ListItem[] {
  if (!sorts.length) return items
  return [...items].sort((x, y) => {
    for (const spec of sorts) {
      const cmp = compareValues(
        sortValue(x, spec.key),
        sortValue(y, spec.key),
        spec.dir
      )
      if (cmp !== 0) return cmp
    }
    return 0
  })
}
