// Level-browse filter/sort types + serialization for the /search page.
//
// These mirror packages/core's Zod schemas as plain TS (the same convention as
// lib/api/logging.ts — apps/web pins zod@3 while core is on zod@4, and the
// server is the source of truth for validation). The range-filter field list
// and its limits are the exception: they are plain constants rather than
// schemas, so they are imported from core instead of copied — a second copy is
// exactly what could drift from what the API accepts.

import {
  LEVEL_RANGE_BOUNDS,
  LEVEL_RANGE_FIELDS,
  isSheetTier,
  type LevelRangeField,
} from '@infernolog/core'
import type { LevelType } from './api/wireEnums'

export type { LevelType, LevelRangeField }
export { LEVEL_RANGE_FIELDS }

/**
 * In-game difficulty as the browse endpoint filters on it — lowercase and hyphenated, unlike the display strings on a `Level`.
 */
export type LevelDifficulty =
  | 'auto'
  | 'easy'
  | 'normal'
  | 'hard'
  | 'harder'
  | 'insane'
  | 'demon-easy'
  | 'demon-medium'
  | 'demon-hard'
  | 'demon-insane'
  | 'demon-extreme'

/**
 * A level's showcase rating, from plain unrated up through mythic.
 */
export type LevelRateStatus =
  | 'unrated'
  | 'rated'
  | 'featured'
  | 'epic'
  | 'legendary'
  | 'mythic'

/**
 * RobTop's five level-length buckets.
 */
export type LevelLength = 'tiny' | 'short' | 'medium' | 'long' | 'xl'
/**
 * Where a level's song comes from: a built-in official track, a Newgrounds custom, or a NONG.
 */
export type LevelSongType = 'official' | 'custom' | 'nong'
/**
 * Whether a text query matches level names or creator names. Never both — RobTop searches one field at a time.
 */
export type LevelSearchBy = 'name' | 'creator'
/**
 * Browse orderings. `relevance` is the server's default and is only meaningful with a text query.
 */
export type LevelSort =
  | 'relevance'
  | 'likes'
  | 'downloads'
  | 'stars'
  | 'gddlTier'
  | 'aredlRank'
  | 'sheetTier'
  | 'enjoyment'
  | 'duration'
  | 'objectCount'
  | 'gameVersion'
  | 'recentlyRated'
  | 'name'
/**
 * Sort direction. Usually left unset so each sort uses its {@link naturalSortDir}.
 */
export type LevelSortDir = 'asc' | 'desc'

/**
 * One optional inclusive bound per quantitative field — `starsMin`,
 * `starsMax`, … — named exactly as the API's query params. An absent bound is
 * an open end.
 */
export type LevelRangeFilters = {
  [K in `${LevelRangeField}Min` | `${LevelRangeField}Max`]?: number | undefined
}

/** The state key holding a field's lower bound. */
export function rangeMinKey(field: LevelRangeField) {
  return `${field}Min` as const
}

/** The state key holding a field's upper bound. */
export function rangeMaxKey(field: LevelRangeField) {
  return `${field}Max` as const
}

/**
 * Optionals are explicitly `| undefined` so a filter can be cleared by merging
 * `{ key: undefined }` into the state (exactOptionalPropertyTypes is on).
 */
export interface LevelSearchFilters extends LevelRangeFilters {
  difficulty?: LevelDifficulty[] | undefined
  rateStatus?: LevelRateStatus[] | undefined
  twoPlayer?: boolean | undefined
  coinCount?: number[] | undefined
  coinsVerified?: boolean | undefined
  length?: LevelLength[] | undefined
  levelType?: LevelType | undefined
  songType?: LevelSongType | undefined
  /** One NLW/LW sheet tier (0–21), matched exactly — the tiers are named categories, not a scale. */
  sheetTier?: number | undefined
}

/**
 * A results-grid row — mirrors LevelBrowseResultSchema.
 */
export interface LevelBrowseResult {
  inGameId: string
  name: string | null
  creator: string | null
  songName: string | null
  inGameDifficulty: string | null
  stars: number | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
  likes: number | null
  downloads: number | null
  length: string | null
  coins: number | null
  coinsVerified: boolean | null
  twoPlayer: boolean | null
  isDemon: boolean
  levelType: LevelType
  // The figures a row surfaces when the user sorts or filters by them.
  objectCount: number | null
  gddlTier: number | null
  aredlRank: number | null
  aredlStatus: string | null
  sheetTier: number | null
  enjoyment: number | null
  durationSeconds: number | null
  gameVersion: string | null
  /** ISO timestamp — JSON carries no dates. */
  ratingStatusSince: string | null
  songType: LevelSongType | null
}

/**
 * One page of browse results plus the keyset cursor for the next, or `null` at the end.
 */
export interface LevelBrowseResponse {
  data: LevelBrowseResult[]
  nextCursor: string | null
}

/**
 * The full /search URL state (the route's search params). `query` empty ⇒ a
 * filter-only browse. `searchBy`/`sort` always have a concrete value.
 */
export interface SearchPageState extends LevelSearchFilters {
  query?: string | undefined
  searchBy: LevelSearchBy
  sort: LevelSort
  sortDir?: LevelSortDir | undefined
}

/**
 * The /search page with nothing chosen: no query, no filters, relevance order.
 */
export const DEFAULT_SEARCH_STATE: SearchPageState = {
  searchBy: 'name',
  sort: 'relevance',
}

/**
 * Each sort's default direction; the UI toggle overrides it via `sortDir`.
 * Names read A→Z and AREDL rank 1 is the hardest level, so both start
 * ascending; everything else is more useful highest-first.
 */
export function naturalSortDir(sort: LevelSort): LevelSortDir {
  return sort === 'name' || sort === 'aredlRank' ? 'asc' : 'desc'
}

/**
 * The direction actually in force — the explicit `sortDir` if the user toggled it, otherwise the sort's {@link naturalSortDir}.
 */
export function effectiveSortDir(s: SearchPageState): LevelSortDir {
  return s.sortDir ?? naturalSortDir(s.sort)
}

// Sorts that only rank extreme demons: AREDL lists nothing else, and the
// NLW/LW sheets are extreme-demon spreadsheets.
const EXTREME_ONLY_SORTS: readonly LevelSort[] = ['aredlRank', 'sheetTier']

/**
 * The state change for picking a sort from the menu. The direction resets to
 * the sort's natural one so the toggle always starts from a predictable
 * default, and a sort that only ranks extreme demons narrows the difficulty
 * filter to Extreme Demon, replacing whatever was selected — the rest of the
 * cache would otherwise sort as one undifferentiated block after them.
 */
export function sortSelectionPatch(sort: LevelSort): Partial<SearchPageState> {
  const patch: Partial<SearchPageState> = {
    sort,
    sortDir: naturalSortDir(sort),
  }
  if (EXTREME_ONLY_SORTS.includes(sort)) patch.difficulty = ['demon-extreme']
  return patch
}

/**
 * Holds an extremes-only sort (AREDL rank, sheet tier) to the filter that
 * makes it meaningful. Picking one narrows difficulty to Extreme Demon (see
 * {@link sortSelectionPatch}); if anything later clears or widens that — Clear
 * all, toggling a difficulty face, a hand-edited URL — the sort falls back to
 * the default, rather than ranking non-extremes, which neither list places, as
 * one undifferentiated block after the extremes.
 */
export function reconcileExtremeSort(s: SearchPageState): SearchPageState {
  if (!EXTREME_ONLY_SORTS.includes(s.sort)) return s
  const d = s.difficulty
  if (d?.length === 1 && d[0] === 'demon-extreme') return s
  return { ...s, sort: DEFAULT_SEARCH_STATE.sort, sortDir: undefined }
}

/**
 * True when any level-independent filter is set (ignores query/searchBy/sort).
 */
export function hasActiveFilters(s: LevelSearchFilters): boolean {
  return (
    !!s.difficulty?.length ||
    !!s.rateStatus?.length ||
    !!s.length?.length ||
    !!s.coinCount?.length ||
    s.twoPlayer !== undefined ||
    s.coinsVerified !== undefined ||
    s.levelType !== undefined ||
    s.songType !== undefined ||
    s.sheetTier !== undefined ||
    LEVEL_RANGE_FIELDS.some(
      (f) =>
        s[rangeMinKey(f)] !== undefined || s[rangeMaxKey(f)] !== undefined
    )
  )
}

/**
 * Whether an escalation to GD's servers can actually be forwarded — mirrors the
 * API's browse-intent gate in GET /v1/levels/gd-search (which rejects anything
 * else with a 400). Only the subset getGJLevels21 can express counts: a name
 * query, a difficulty / rate-status / length / two-player / has-coins /
 * Newgrounds-song filter, or a downloads/likes sort. Creator queries aren't
 * forwardable (GD has no creator search), so in creator mode only the
 * filters/sort count. Cache-only refinements (exact coin count, coinsVerified,
 * levelType, official/NONG song, the sheet tier, every range bound, and every
 * sort but downloads/likes) do NOT make an escalation forwardable.
 */
export function canEscalateToGd(s: SearchPageState): boolean {
  const hasNameQuery = s.searchBy === 'name' && !!s.query?.trim()
  return (
    hasNameQuery ||
    !!s.difficulty?.length ||
    !!s.rateStatus?.length ||
    !!s.length?.length ||
    s.twoPlayer !== undefined ||
    !!s.coinCount?.some((v) => v > 0) ||
    s.songType === 'custom' ||
    s.sort === 'downloads' ||
    s.sort === 'likes'
  )
}

/**
 * Difficulty filter chips, in in-game order.
 */
export const DIFFICULTY_OPTIONS: { value: LevelDifficulty; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
  { value: 'harder', label: 'Harder' },
  { value: 'insane', label: 'Insane' },
  { value: 'demon-easy', label: 'Easy Demon' },
  { value: 'demon-medium', label: 'Medium Demon' },
  { value: 'demon-hard', label: 'Hard Demon' },
  { value: 'demon-insane', label: 'Insane Demon' },
  { value: 'demon-extreme', label: 'Extreme Demon' },
]

/**
 * Rate-status filter chips, in ascending showcase order.
 */
export const RATE_STATUS_OPTIONS: { value: LevelRateStatus; label: string }[] =
  [
    { value: 'unrated', label: 'Unrated' },
    { value: 'rated', label: 'Rated' },
    { value: 'featured', label: 'Featured' },
    { value: 'epic', label: 'Epic' },
    { value: 'legendary', label: 'Legendary' },
    { value: 'mythic', label: 'Mythic' },
  ]

/**
 * Length filter chips, shortest first.
 */
export const LENGTH_OPTIONS: { value: LevelLength; label: string }[] = [
  { value: 'tiny', label: 'Tiny' },
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
  { value: 'xl', label: 'XL' },
]

/**
 * Song-type filter chips.
 */
export const SONG_TYPE_OPTIONS: { value: LevelSongType; label: string }[] = [
  { value: 'official', label: 'Official' },
  { value: 'custom', label: 'Newgrounds' },
  { value: 'nong', label: 'NONG' },
]

/**
 * Classic/Platformer filter chips.
 */
export const LEVEL_TYPE_OPTIONS: { value: LevelType; label: string }[] = [
  { value: 'CLASSIC', label: 'Classic' },
  { value: 'PLATFORMER', label: 'Platformer' },
]

/**
 * The browse sort menu. Distinct from the Log page's `LIST_SORT_OPTIONS`, which
 * sorts logged rows rather than levels. `hint` is a note shown under the label
 * for a sort that also changes the filters (see {@link sortSelectionPatch}).
 */
export const LEVEL_SORT_OPTIONS: {
  value: LevelSort
  label: string
  hint?: string
}[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'likes', label: 'Likes' },
  { value: 'stars', label: 'Difficulty' },
  { value: 'gddlTier', label: 'GDDL tier' },
  { value: 'aredlRank', label: 'AREDL rank', hint: 'Extreme demons only' },
  { value: 'sheetTier', label: 'Sheet tier', hint: 'Extreme demons only' },
  { value: 'enjoyment', label: 'Enjoyment' },
  { value: 'duration', label: 'Duration' },
  { value: 'objectCount', label: 'Object count' },
  { value: 'gameVersion', label: 'Game version' },
  { value: 'recentlyRated', label: 'Recently rated' },
  { value: 'name', label: 'Name' },
]

/**
 * The DifficultyFace inputs (difficulty label + glow) representing each
 * difficulty filter token — the filter panel renders faces, not text.
 */
export const DIFFICULTY_FACE: Record<LevelDifficulty, { difficulty: string }> =
  {
    auto: { difficulty: 'Auto' },
    easy: { difficulty: 'Easy' },
    normal: { difficulty: 'Normal' },
    hard: { difficulty: 'Hard' },
    harder: { difficulty: 'Harder' },
    insane: { difficulty: 'Insane' },
    'demon-easy': { difficulty: 'Easy Demon' },
    'demon-medium': { difficulty: 'Medium Demon' },
    'demon-hard': { difficulty: 'Hard Demon' },
    'demon-insane': { difficulty: 'Insane Demon' },
    'demon-extreme': { difficulty: 'Extreme Demon' },
  }

/**
 * Rate status as a DifficultyFace: unrated is a plain Insane face (no glow);
 * every rated tier is a Hard Demon face carrying the matching showcase glow.
 */
export const RATE_STATUS_FACE: Record<
  LevelRateStatus,
  { difficulty: string; featured?: boolean; epicValue?: number }
> = {
  unrated: { difficulty: 'Insane' },
  rated: { difficulty: 'Hard Demon' },
  featured: { difficulty: 'Hard Demon', featured: true },
  epic: { difficulty: 'Hard Demon', epicValue: 1 },
  legendary: { difficulty: 'Hard Demon', epicValue: 2 },
  mythic: { difficulty: 'Hard Demon', epicValue: 3 },
}

/**
 * The name/creator toggle beside the search box.
 */
export const SEARCH_BY_OPTIONS: { value: LevelSearchBy; label: string }[] = [
  { value: 'name', label: 'Level name' },
  { value: 'creator', label: 'Creator' },
]

const DIFFICULTY_VALUES = DIFFICULTY_OPTIONS.map((o) => o.value)
const RATE_STATUS_VALUES = RATE_STATUS_OPTIONS.map((o) => o.value)
const LENGTH_VALUES = LENGTH_OPTIONS.map((o) => o.value)
const SONG_TYPE_VALUES = SONG_TYPE_OPTIONS.map((o) => o.value)
const LEVEL_TYPE_VALUES = LEVEL_TYPE_OPTIONS.map((o) => o.value)
const SORT_VALUES = LEVEL_SORT_OPTIONS.map((o) => o.value)
const SEARCH_BY_VALUES = SEARCH_BY_OPTIONS.map((o) => o.value)

function arrOf<T>(v: unknown, allowed: readonly T[]): T[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((x): x is T => allowed.includes(x as T))
  return out.length ? out : undefined
}
function oneOf<T>(v: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(v as T) ? (v as T) : undefined
}
function boolOf(v: unknown): boolean | undefined {
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  return undefined
}
// A range bound the API would accept for this field, or undefined. Checked
// against core's own limits so a hand-edited URL is dropped here rather than
// earning a 400 that the grid would show as a failed search.
function boundOf(v: unknown, field: LevelRangeField): number | undefined {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && v.trim() !== ''
        ? Number(v)
        : Number.NaN
  if (!Number.isFinite(n)) return undefined
  const b = LEVEL_RANGE_BOUNDS[field]
  if (b.int && !Number.isInteger(n)) return undefined
  if (b.min !== null && n < b.min) return undefined
  if (b.max !== null && n > b.max) return undefined
  return n
}
function sheetTierOf(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && isSheetTier(n) ? n : undefined
}

/**
 * Coerces the router's raw search object into a well-formed SearchPageState,
 * dropping anything unrecognized. Used by the route's validateSearch so the URL
 * is always the source of truth and a hand-edited URL can't crash the page.
 */
export function validateSearchState(
  raw: Record<string, unknown>
): SearchPageState {
  const coinCount = Array.isArray(raw.coinCount)
    ? (raw.coinCount as unknown[])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 3)
    : undefined
  const ranges: LevelRangeFilters = {}
  for (const f of LEVEL_RANGE_FIELDS) {
    ranges[rangeMinKey(f)] = boundOf(raw[rangeMinKey(f)], f)
    ranges[rangeMaxKey(f)] = boundOf(raw[rangeMaxKey(f)], f)
  }
  return reconcileExtremeSort({
    query:
      typeof raw.query === 'string' && raw.query.length > 0
        ? raw.query
        : undefined,
    searchBy: oneOf(raw.searchBy, SEARCH_BY_VALUES) ?? 'name',
    sort: oneOf(raw.sort, SORT_VALUES) ?? 'relevance',
    sortDir: oneOf(raw.sortDir, ['asc', 'desc'] as const),
    difficulty: arrOf(raw.difficulty, DIFFICULTY_VALUES),
    rateStatus: arrOf(raw.rateStatus, RATE_STATUS_VALUES),
    length: arrOf(raw.length, LENGTH_VALUES),
    coinCount: coinCount?.length ? coinCount : undefined,
    twoPlayer: boolOf(raw.twoPlayer),
    coinsVerified: boolOf(raw.coinsVerified),
    levelType: oneOf(raw.levelType, LEVEL_TYPE_VALUES),
    songType: oneOf(raw.songType, SONG_TYPE_VALUES),
    sheetTier: sheetTierOf(raw.sheetTier),
    ...ranges,
  })
}

/**
 * Serializes the search state into the query string GET /v1/levels/browse (and
 * /v1/levels/gd-search) expect: arrays as repeated params, booleans as
 * "true"/"false", range bounds as `<field>Min`/`<field>Max`. `cursor` is the
 * keyset page token (browse only).
 */
export function browseApiQueryString(
  s: SearchPageState,
  cursor?: string
): string {
  const sp = new URLSearchParams()
  const q = s.query?.trim()
  if (q) sp.set('q', q)
  sp.set('searchBy', s.searchBy)
  sp.set('sort', s.sort)
  if (s.sortDir) sp.set('sortDir', s.sortDir)
  if (cursor) sp.set('cursor', cursor)
  s.difficulty?.forEach((d) => sp.append('difficulty', d))
  s.rateStatus?.forEach((r) => sp.append('rateStatus', r))
  s.length?.forEach((l) => sp.append('length', l))
  s.coinCount?.forEach((c) => sp.append('coinCount', String(c)))
  if (s.twoPlayer !== undefined) sp.set('twoPlayer', String(s.twoPlayer))
  if (s.coinsVerified !== undefined)
    sp.set('coinsVerified', String(s.coinsVerified))
  if (s.levelType) sp.set('levelType', s.levelType)
  if (s.songType) sp.set('songType', s.songType)
  if (s.sheetTier !== undefined) sp.set('sheetTier', String(s.sheetTier))
  for (const f of LEVEL_RANGE_FIELDS) {
    for (const key of [rangeMinKey(f), rangeMaxKey(f)]) {
      const v = s[key]
      if (v !== undefined) sp.set(key, String(v))
    }
  }
  return sp.toString()
}
