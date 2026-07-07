import type { LevelProgressListItem } from '@infernolog/core'

export type ProgressStatus = 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
export type LevelTypeFilter = 'CLASSIC' | 'PLATFORMER'
export type DeviceFilter = 'pc' | 'mobile'
export type RatedStatusFilter =
  | 'ALL'
  | 'UNRATED'
  | 'RATED'
  | 'FEATURED'
  | 'EPIC'
  | 'LEGENDARY'
  | 'MYTHIC'
export type StatusFlag =
  | 'hasVideo'
  | 'onStream'
  | 'uncertainDate'
  | 'needsPlacement'
  | 'twoPlayer'
  | 'hasCoins'
  | 'verifiedCoins'

// A [min, max] inclusive range. Equal to its domain means "no constraint".
export type Range = [number, number]

// Open-ended date bounds — either bound may be null (= unbounded).
// Stored separately so the right bound never silently captures "today."
export type DateBounds = { from: number | null; to: number | null }

export interface FilterState {
  statuses: ProgressStatus[] // empty = all
  levelTypes: LevelTypeFilter[] // empty = all
  devices: DeviceFilter[] // empty = all
  ratedStatus: RatedStatusFilter // 'ALL' = no constraint
  flags: StatusFlag[] // all selected must be true (AND)
  lengths: string[] // empty = all (level.length values)
  gameVersions: string[] // empty = all (level.gameVersion values)
  difficulties: string[] // empty = all (level.inGameDifficulty values)
  rating: Range // internal 0–100
  enjoyment: Range // internal 0–100
  tier: Range // 1–35 (35 = 35+)
  attempts: Range // 0–25000 (25000 = 25000+)
  dateBeaten: DateBounds
  // Per-category range filters: categoryId → [min, max]. Only active entries
  // constrain results; missing entries are treated as the full domain.
  categoryRatings: Record<string, Range>
}

export type StaticSortKey =
  | 'name'
  | 'date'
  | 'attempts'
  | 'rating'
  | 'enjoyment'
  | 'tier'
  | 'status'
  | 'id'
  | 'length'
  | 'songName'
  | 'songArtist'
  | 'coins'
  | 'gameVersion'
  | 'twoPlayer'
  | 'creator'
  | 'difficulty'

// `cat:${categoryId}` keys sort by a specific weighted-rating category score.
export type SortKey = StaticSortKey | `cat:${string}`

export interface SortSpec {
  key: SortKey
  dir: 'asc' | 'desc'
}

export type ListItem = LevelProgressListItem

// ── Range domains ──────────────────────────────────────────────────────────
export const RATING_DOMAIN: Range = [0, 100]
export const ENJOYMENT_DOMAIN: Range = [0, 100]
export const TIER_DOMAIN: Range = [1, 35]
export const ATTEMPTS_DOMAIN: Range = [0, 25000]
export const DATE_MIN_MS = Date.UTC(2013, 0, 1) // Jan 2013 — GD's launch

export function defaultFilterState(): FilterState {
  return {
    statuses: [],
    levelTypes: [],
    devices: [],
    ratedStatus: 'ALL',
    flags: [],
    lengths: [],
    gameVersions: [],
    difficulties: [],
    rating: [...RATING_DOMAIN] as Range,
    enjoyment: [...ENJOYMENT_DOMAIN] as Range,
    tier: [...TIER_DOMAIN] as Range,
    attempts: [...ATTEMPTS_DOMAIN] as Range,
    dateBeaten: { from: null, to: null },
    categoryRatings: {},
  }
}

// Merge a possibly-incomplete stored FilterState (e.g. a preset saved before a
// filter field existed) onto the current defaults so every field is present.
export function normalizeFilterState(
  stored: Partial<FilterState> | null | undefined
): FilterState {
  return { ...defaultFilterState(), ...(stored ?? {}) }
}
