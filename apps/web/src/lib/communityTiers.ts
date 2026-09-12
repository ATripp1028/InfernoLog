// Which of the three community difficulty lists a level actually appears on,
// and how each placement is painted. The single source of that answer: the
// Global Level Page's TIERS section, the /search result rows and the demon
// list's rows all derive their chips from here, so a level's standing reads
// the same everywhere and the rules that are easy to get wrong — AREDL's
// Legacy positions, sheet tier 0 — live in one place.
//
// What goes IN each chip (badge text, colour, readable foreground) is
// lib/tierBadges; this module only decides which chips exist and labels them.
// Pure — the components render what it returns.
//
// These are the level's REAL, current placements, merged onto the level row
// from the Global Stats Viewer, GDDL and AREDL (see EXTERNAL_APIS.md). That is
// a different thing from LevelProgress.userGddlTier, one user's own tier
// opinion captured when they logged the level.

import {
  TIER_LIST_ICONS,
  aredlLook,
  gddlTierLook,
  sheetTierLook,
  type TierBadgeLook,
} from './tierBadges'
import { isSheetTier } from './sheetTier'

/** The three lists, in the order a row or a section shows them. */
export const COMMUNITY_LIST_KEYS = ['gddl', 'aredl', 'sheet'] as const

/** Which community list a chip came from. */
export type CommunityListKey = (typeof COMMUNITY_LIST_KEYS)[number]

/**
 * One placement, ready to render as a chip.
 *
 * `label` names the list AND what the number is ("AREDL rank" vs "AREDL
 * status"), because the chip itself is only an icon and a badge — the label is
 * the whole of its accessible name and its tooltip.
 */
export interface CommunityTierChip {
  key: CommunityListKey
  label: string
  /** The list's favicon, which is what identifies the chip at a glance. */
  icon: string
  look: TierBadgeLook
  /** Which spreadsheet a sheet tier came from; null for the other two lists. */
  source: 'NLW' | 'LW' | null
  /**
   * The raw placement behind the badge. Kept even where the badge doesn't show
   * it (the spreadsheets show their tier's name), because the number is what
   * the chip's meaning hangs on — matching a display string to find, say,
   * sheet tier 0 would break the moment a sheet renames a tier.
   */
  value: number
}

/**
 * The placement columns this module reads. Structural rather than one named
 * wire type: core's `CommunityTiers`, a `/search` result and the Global Level
 * Page's payload all carry the same four fields under the same names.
 *
 * `aredlStatus` is optional because a payload cached before that field existed
 * carries undefined — the same "no status known" case as null.
 */
export interface CommunityTierSource {
  gddlTier: number | null
  aredlRank: number | null
  aredlStatus?: string | null
  sheetTier: number | null
}

/**
 * The chip for one list, or null when the level does not appear on it.
 *
 * Each list is gated on the data rather than on the level's difficulty: GDDL
 * rates demons and AREDL and the spreadsheets cover extremes, so "has a
 * placement" already means "is the kind of level this list covers" — and an
 * insane demon that AREDL demoted to Legacy still gets its AREDL chip, which a
 * difficulty gate would hide.
 */
export function communityTierChip(
  level: CommunityTierSource,
  key: CommunityListKey
): CommunityTierChip | null {
  switch (key) {
    case 'gddl': {
      if (level?.gddlTier == null) return null
      return {
        key,
        label: 'GDDL tier',
        icon: TIER_LIST_ICONS.gddl,
        look: gddlTierLook(level.gddlTier),
        source: null,
        value: Math.round(level.gddlTier),
      }
    }
    case 'aredl': {
      if (level?.aredlRank == null && level?.aredlStatus == null) return null
      // An AREDL chip can exist for a status alone: Legacy is where levels
      // demoted out of extreme go, and that placement is worth showing even
      // though the number attached to it is not a rank (see aredlLook).
      const look = aredlLook(level.aredlRank, level.aredlStatus)
      if (!look) return null
      return {
        key,
        label: look.ranked ? 'AREDL rank' : 'AREDL status',
        icon: TIER_LIST_ICONS.aredl,
        look,
        source: null,
        value: level.aredlRank ?? 0,
      }
    }
    case 'sheet': {
      if (level?.sheetTier == null) return null
      // `isSheetTier`, not a truthiness check — tier 0 ("Fuck") is a real
      // placement, and the sheets start at 0.
      if (!isSheetTier(level.sheetTier)) return null
      const look = sheetTierLook(level.sheetTier)!
      return {
        key,
        label: 'Sheet tier',
        icon: TIER_LIST_ICONS.sheet,
        look,
        source: look.source,
        value: level.sheetTier,
      }
    }
  }
}

/**
 * Every list the level is on, in list order.
 *
 * @returns an empty array when it is on none of the three — which is also a
 * caller's render gate, since a tiers section with no tiers reads as a loading
 * failure rather than as "not ranked anywhere".
 */
export function communityTierChips(
  level: CommunityTierSource
): CommunityTierChip[] {
  return COMMUNITY_LIST_KEYS.map((key) => communityTierChip(level, key)).filter(
    (chip): chip is CommunityTierChip => chip !== null
  )
}
