// Mapping filter state onto the controls that edit it, and back. Pure —
// SearchFilters renders the chips, segmented controls and the sheet-tier
// dropdown; this decides what each one reads and what a click produces.

import { SHEET_TIER_NAMES, isSheetTier } from '@/lib/sheetTier'
import { sheetTierLook, type TierBadgeLook } from '@/lib/tierBadges'

/**
 * Toggles membership of `v` in a filter array.
 *
 * An emptied array collapses back to `undefined` so the URL stays clean —
 * `?difficulty=` with nothing after it is not the same as the filter being
 * absent, and only the absent form round-trips as "no constraint".
 */
export function toggle<T>(arr: T[] | undefined, v: T): T[] | undefined {
  const set = new Set(arr ?? [])
  if (set.has(v)) set.delete(v)
  else set.add(v)
  const out = [...set]
  return out.length ? out : undefined
}

/**
 * The three-way segmented control a nullable-boolean filter renders as.
 */
export const TRISTATE = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const

/** One of {@link TRISTATE}'s values. */
export type TriValue = (typeof TRISTATE)[number]['value']

/**
 * Which segment a nullable-boolean filter is currently on. `undefined` — the
 * filter being absent — is 'any'.
 */
export function triValue(b: boolean | undefined): TriValue {
  return b === undefined ? 'any' : b ? 'yes' : 'no'
}

/**
 * Inverse of {@link triValue}: the filter value a segment click produces.
 * 'any' clears the filter rather than setting it to `false`.
 */
export function fromTri(v: TriValue): boolean | undefined {
  return v === 'any' ? undefined : v === 'yes'
}

/**
 * The sheet-tier dropdown's "no filter" entry. Radix Select values are strings
 * and cannot be empty, so the absent filter needs a token of its own.
 */
export const ANY_SHEET_TIER = 'any'

/**
 * One dropdown entry per sheet tier, in ladder order, each carrying the badge
 * it is painted with and whether it is listworthy. Tier 0 gets a note: its
 * name reads as "easier than Beginner" to anyone who doesn't know the ladder,
 * when it holds levels too niche to rank.
 */
export const SHEET_TIER_OPTIONS: {
  value: string
  tier: number
  look: TierBadgeLook & { source: 'NLW' | 'LW' }
  note: string | null
}[] = SHEET_TIER_NAMES.map((_, tier) => ({
  value: String(tier),
  tier,
  look: sheetTierLook(tier)!,
  note: tier === 0 ? 'Too niche to rank' : null,
}))

/** The dropdown value for the current sheet-tier filter. */
export function sheetTierSelectValue(tier: number | undefined): string {
  return tier === undefined ? ANY_SHEET_TIER : String(tier)
}

/**
 * Inverse of {@link sheetTierSelectValue}. Anything that isn't a tier on the
 * ladder — the "any" entry included — clears the filter.
 */
export function sheetTierFromSelect(value: string): number | undefined {
  if (value === ANY_SHEET_TIER) return undefined
  const n = Number(value)
  return isSheetTier(n) ? n : undefined
}
