import type { LevelProgressListItem } from '@infernolog/core'
import type { Device, LevelTypeFilter } from '@/lib/api/wireEnums'

export type { LevelTypeFilter }

/**
 * Where a level stands for the user. Mirrors core's `LevelProgressStatus`.
 */
export type ProgressStatus = 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
/**
 * The rated-status filter. `ALL` means no constraint, which is why it is a single value rather than an empty array like the other multi-selects.
 */
export type RatedStatusFilter =
  | 'ALL'
  | 'UNRATED'
  | 'RATED'
  | 'FEATURED'
  | 'EPIC'
  | 'LEGENDARY'
  | 'MYTHIC'
/**
 * Boolean row properties the filter can require. Every selected flag must hold (AND), not any.
 */
export type StatusFlag =
  | 'hasVideo'
  | 'onStream'
  | 'uncertainDate'
  | 'needsPlacement'
  | 'twoPlayer'
  | 'hasCoins'
  | 'verifiedCoins'

/**
 * A [min, max] inclusive range. Equal to its domain means "no constraint".
 */
export type Range = [number, number]

/**
 * Open-ended date bounds — either bound may be null (= unbounded).
 * Stored separately so the right bound never silently captures "today."
 */
export type DateBounds = { from: number | null; to: number | null }

/**
 * Every List filter, as one serializable object.
 *
 * An empty array means "no constraint" for the multi-selects, and a range
 * equal to its domain means the same for the numeric filters — so the default
 * state is a real value rather than a set of nulls. Presets store this whole
 * shape, which is why `normalizeFilterState` exists: an old preset is missing
 * fields added since.
 */
export interface FilterState {
  statuses: ProgressStatus[] // empty = all
  levelTypes: LevelTypeFilter[] // empty = all
  devices: Device[] // empty = all
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

/**
 * A sort over a fixed column. See {@link SortKey} for the per-category variant.
 */
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

/**
 * `cat:${categoryId}` keys sort by a specific weighted-rating category score.
 */
export type SortKey = StaticSortKey | `cat:${string}`

/**
 * One level of the sort stack: a key and a direction. The Log sorts by an ordered list of these.
 */
export interface SortSpec {
  key: SortKey
  dir: 'asc' | 'desc'
}

/**
 * One List row. Aliased from core so feature code names the thing it renders rather than the wire type.
 */
export type LogItem = LevelProgressListItem

/**
 * The full span of the overall-rating filter, in internal units. A range
 * equal to its domain means the filter is off — see {@link isRangeActive}.
 */
export const RATING_DOMAIN: Range = [0, 100]
/**
 * The full span of the enjoyment filter, in internal units.
 */
export const ENJOYMENT_DOMAIN: Range = [0, 100]
/**
 * The full span of the GDDL tier filter. 35 is an open-ended "35+".
 */
export const TIER_DOMAIN: Range = [1, 35]
/**
 * The full span of the attempts filter. 25000 is an open-ended "25000+".
 */
export const ATTEMPTS_DOMAIN: Range = [0, 25000]
/**
 * The earliest date the date filter offers — GD's launch. Nothing can be beaten before the game existed.
 */
export const DATE_MIN_MS = Date.UTC(2013, 0, 1) // Jan 2013 — GD's launch

/**
 * A fresh FilterState with every filter off. A function, not a constant, so callers cannot mutate a shared object.
 */
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

/**
 * Merge a possibly-incomplete stored FilterState (e.g. a preset saved before a
 * filter field existed) onto the current defaults so every field is present.
 */
export function normalizeFilterState(
  stored: Partial<FilterState> | null | undefined
): FilterState {
  return { ...defaultFilterState(), ...(stored ?? {}) }
}
