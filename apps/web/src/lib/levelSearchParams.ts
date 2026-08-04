// Level-browse filter/sort types + serialization for the /search page.
//
// These mirror packages/core's Zod schemas as plain TS (the same convention as
// lib/api/logging.ts — apps/web pins zod@3 while core is on zod@4, and the
// server is the source of truth for validation).

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

export type LevelRateStatus =
  | 'unrated'
  | 'rated'
  | 'featured'
  | 'epic'
  | 'legendary'
  | 'mythic'

export type LevelLength = 'tiny' | 'short' | 'medium' | 'long' | 'xl'
export type LevelSongType = 'official' | 'custom' | 'nong'
export type LevelTypeFilter = 'CLASSIC' | 'PLATFORMER'
export type LevelSearchBy = 'name' | 'creator'
export type LevelSort =
  | 'relevance'
  | 'likes'
  | 'downloads'
  | 'stars'
  | 'objectCount'
  | 'recentlyRated'
  | 'name'

// Optionals are explicitly `| undefined` so a filter can be cleared by merging
// `{ key: undefined }` into the state (exactOptionalPropertyTypes is on).
export interface LevelSearchFilters {
  difficulty?: LevelDifficulty[] | undefined
  rateStatus?: LevelRateStatus[] | undefined
  twoPlayer?: boolean | undefined
  coinCount?: number[] | undefined
  coinsVerified?: boolean | undefined
  length?: LevelLength[] | undefined
  levelType?: LevelTypeFilter | undefined
  songType?: LevelSongType | undefined
}

// A results-grid row — mirrors LevelBrowseResultSchema.
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
  levelType: LevelTypeFilter
}

export interface LevelBrowseResponse {
  data: LevelBrowseResult[]
  nextCursor: string | null
}

// The full /search URL state (the route's search params). `query` empty ⇒ a
// filter-only browse. `searchBy`/`sort` always have a concrete value.
export interface SearchPageState extends LevelSearchFilters {
  query?: string | undefined
  searchBy: LevelSearchBy
  sort: LevelSort
}

export const DEFAULT_SEARCH_STATE: SearchPageState = {
  searchBy: 'name',
  sort: 'relevance',
}

// True when any level-independent filter is set (ignores query/searchBy/sort).
export function hasActiveFilters(s: LevelSearchFilters): boolean {
  return (
    !!s.difficulty?.length ||
    !!s.rateStatus?.length ||
    !!s.length?.length ||
    !!s.coinCount?.length ||
    s.twoPlayer !== undefined ||
    s.coinsVerified !== undefined ||
    s.levelType !== undefined ||
    s.songType !== undefined
  )
}

// ── Labeled options for the filter/sort UI ─────────────────────────────────

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

export const RATE_STATUS_OPTIONS: { value: LevelRateStatus; label: string }[] = [
  { value: 'unrated', label: 'Unrated' },
  { value: 'rated', label: 'Rated' },
  { value: 'featured', label: 'Featured' },
  { value: 'epic', label: 'Epic' },
  { value: 'legendary', label: 'Legendary' },
  { value: 'mythic', label: 'Mythic' },
]

export const LENGTH_OPTIONS: { value: LevelLength; label: string }[] = [
  { value: 'tiny', label: 'Tiny' },
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
  { value: 'xl', label: 'XL' },
]

export const SONG_TYPE_OPTIONS: { value: LevelSongType; label: string }[] = [
  { value: 'official', label: 'Official' },
  { value: 'custom', label: 'Custom (Newgrounds)' },
  { value: 'nong', label: 'NONG' },
]

export const LEVEL_TYPE_OPTIONS: { value: LevelTypeFilter; label: string }[] = [
  { value: 'CLASSIC', label: 'Classic' },
  { value: 'PLATFORMER', label: 'Platformer' },
]

export const SORT_OPTIONS: { value: LevelSort; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'likes', label: 'Likes' },
  { value: 'stars', label: 'Difficulty (stars)' },
  { value: 'objectCount', label: 'Object count' },
  { value: 'recentlyRated', label: 'Recently rated' },
  { value: 'name', label: 'Name (A–Z)' },
]

export const SEARCH_BY_OPTIONS: { value: LevelSearchBy; label: string }[] = [
  { value: 'name', label: 'Level name' },
  { value: 'creator', label: 'Creator' },
]

const DIFFICULTY_VALUES = DIFFICULTY_OPTIONS.map((o) => o.value)
const RATE_STATUS_VALUES = RATE_STATUS_OPTIONS.map((o) => o.value)
const LENGTH_VALUES = LENGTH_OPTIONS.map((o) => o.value)
const SONG_TYPE_VALUES = SONG_TYPE_OPTIONS.map((o) => o.value)
const LEVEL_TYPE_VALUES = LEVEL_TYPE_OPTIONS.map((o) => o.value)
const SORT_VALUES = SORT_OPTIONS.map((o) => o.value)
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

// Coerces the router's raw search object into a well-formed SearchPageState,
// dropping anything unrecognized. Used by the route's validateSearch so the URL
// is always the source of truth and a hand-edited URL can't crash the page.
export function validateSearchState(
  raw: Record<string, unknown>
): SearchPageState {
  const coinCount = Array.isArray(raw.coinCount)
    ? (raw.coinCount as unknown[])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 3)
    : undefined
  return {
    query:
      typeof raw.query === 'string' && raw.query.length > 0
        ? raw.query
        : undefined,
    searchBy: oneOf(raw.searchBy, SEARCH_BY_VALUES) ?? 'name',
    sort: oneOf(raw.sort, SORT_VALUES) ?? 'relevance',
    difficulty: arrOf(raw.difficulty, DIFFICULTY_VALUES),
    rateStatus: arrOf(raw.rateStatus, RATE_STATUS_VALUES),
    length: arrOf(raw.length, LENGTH_VALUES),
    coinCount: coinCount?.length ? coinCount : undefined,
    twoPlayer: boolOf(raw.twoPlayer),
    coinsVerified: boolOf(raw.coinsVerified),
    levelType: oneOf(raw.levelType, LEVEL_TYPE_VALUES),
    songType: oneOf(raw.songType, SONG_TYPE_VALUES),
  }
}

// Serializes the search state into the query string GET /v1/levels/browse (and
// /v1/levels/gd-search) expect: arrays as repeated params, booleans as
// "true"/"false". `cursor` is the keyset page token (browse only).
export function browseApiQueryString(
  s: SearchPageState,
  cursor?: string
): string {
  const sp = new URLSearchParams()
  const q = s.query?.trim()
  if (q) sp.set('q', q)
  sp.set('searchBy', s.searchBy)
  sp.set('sort', s.sort)
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
  return sp.toString()
}
