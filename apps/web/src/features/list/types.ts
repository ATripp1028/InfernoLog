import type { LevelProgressListItem } from '@infernolog/core'

export type ProgressStatus = 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
export type ListSourceFilter = 'GDDL' | 'AREDL' | 'NLW'
export type LevelTypeFilter = 'CLASSIC' | 'PLATFORMER'
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

// A [min, max] inclusive range. Equal to its domain means "no constraint".
export type Range = [number, number]

export interface FilterState {
  statuses: ProgressStatus[] // empty = all
  listSources: ListSourceFilter[] // empty = all
  levelTypes: LevelTypeFilter[] // empty = all
  ratedStatus: RatedStatusFilter // 'ALL' = no constraint
  flags: StatusFlag[] // all selected must be true (AND)
  rating: Range // internal 0–100
  enjoyment: Range // internal 0–100
  tier: Range // 1–35 (35 = 35+)
  attempts: Range // 0–25000 (25000 = 25000+)
  dateBeaten: Range // epoch ms
}

export type SortKey =
  | 'name'
  | 'date'
  | 'attempts'
  | 'rating'
  | 'enjoyment'
  | 'tier'
  | 'status'

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

export function dateDomain(): Range {
  return [DATE_MIN_MS, Date.now()]
}

export function defaultFilterState(): FilterState {
  return {
    statuses: [],
    listSources: [],
    levelTypes: [],
    ratedStatus: 'ALL',
    flags: [],
    rating: [...RATING_DOMAIN] as Range,
    enjoyment: [...ENJOYMENT_DOMAIN] as Range,
    tier: [...TIER_DOMAIN] as Range,
    attempts: [...ATTEMPTS_DOMAIN] as Range,
    dateBeaten: dateDomain(),
  }
}
