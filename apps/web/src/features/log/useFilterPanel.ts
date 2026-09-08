// Logic for FilterPanel: the fixed option sets each chip group renders, and
// the writers that turn a click into a new FilterState. The panel itself is
// fully controlled — it holds no filter state, so this is patch helpers plus
// the parsers/clamps the numeric inputs need.

import {
  RATING_DOMAIN,
  TIER_DOMAIN,
  defaultFilterState,
  type FilterState,
  type LevelType,
  type ProgressStatus,
  type RatedStatusFilter,
  type StatusFlag,
} from './types'
import { countActiveFilters } from './filtering'
import { toScoreInternal } from '@/lib/ratingScale'
import type { Device } from '@/lib/api/wireEnums'

/**
 * Progress-status filter chips.
 */
export const PROGRESS: { value: ProgressStatus; label: string }[] = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DROPPED', label: 'Dropped' },
]
/**
 * Classic/Platformer filter chips.
 */
export const LEVEL_TYPES: { value: LevelType; label: string }[] = [
  { value: 'CLASSIC', label: 'Classic' },
  { value: 'PLATFORMER', label: 'Platformer' },
]
/**
 * Device filter chips.
 */
export const DEVICES: { value: Device; label: string }[] = [
  { value: 'pc', label: 'PC' },
  { value: 'mobile', label: 'Mobile' },
]
/**
 * Rated-status filter values, in ascending showcase order.
 */
export const RATED_STATUSES: RatedStatusFilter[] = [
  'ALL',
  'UNRATED',
  'RATED',
  'FEATURED',
  'EPIC',
  'LEGENDARY',
  'MYTHIC',
]
/**
 * Flags that describe the user's run.
 */
export const FLAGS: { value: StatusFlag; label: string }[] = [
  { value: 'hasVideo', label: 'Has video' },
  { value: 'onStream', label: 'On stream' },
  { value: 'uncertainDate', label: 'Uncertain date' },
  { value: 'needsPlacement', label: 'Needs placement' },
]
/**
 * Flags that describe the level itself.
 */
export const LEVEL_FLAGS: { value: StatusFlag; label: string }[] = [
  { value: 'twoPlayer', label: 'Two player' },
  { value: 'hasCoins', label: 'Has coins' },
  { value: 'verifiedCoins', label: 'Verified coins' },
]

/**
 * Add/remove one value in a multi-select filter field.
 */
export function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

/**
 * Option tables and patch helpers for FilterPanel. The panel is fully controlled and holds no filter state itself.
 */
export function useFilterPanel({
  filters,
  onChange,
  maxAttempts,
}: {
  filters: FilterState
  onChange: (next: FilterState) => void
  maxAttempts: number
}) {
  const set = (patch: Partial<FilterState>) =>
    onChange({ ...filters, ...patch })

  // Filter bounds are stored on the internal 0–100 domain whatever the field
  // is typed on, so a score crosses a conversion here and enjoyment does not.
  function clampToDomain(v: number): number {
    return Math.min(RATING_DOMAIN[1], Math.max(RATING_DOMAIN[0], v))
  }

  /** A score typed on the 0–10 scale. */
  function parseScore(text: string): number | null {
    const v = parseFloat(text)
    if (isNaN(v)) return null
    return clampToDomain(toScoreInternal(v))
  }

  /** Enjoyment, typed on the same 0–100 scale it is stored on. */
  function parseEnjoyment(text: string): number | null {
    const v = parseFloat(text)
    if (isNaN(v)) return null
    return clampToDomain(Math.round(v))
  }

  function parseTier(text: string): number | null {
    const v = parseInt(text.replace('+', ''), 10)
    if (isNaN(v)) return null
    return Math.min(TIER_DOMAIN[1], Math.max(TIER_DOMAIN[0], v))
  }

  function parseAttempts(text: string): number | null {
    const v = parseInt(text.replace(/,/g, ''), 10)
    if (isNaN(v)) return null
    return Math.min(maxAttempts, Math.max(0, v))
  }

  function setCategoryRating(categoryId: string, range: [number, number]) {
    set({
      categoryRatings: {
        ...(filters.categoryRatings ?? {}),
        [categoryId]: range,
      },
    })
  }

  return {
    set,
    setCategoryRating,
    clearAll: () => onChange(defaultFilterState()),
    hasActiveFilters: countActiveFilters(filters) > 0,
    parseScore,
    parseEnjoyment,
    parseTier,
    parseAttempts,
    // Upper bound for the date pickers; read once per render so both
    // From and To agree on "today".
    today: Date.now(),
  }
}
