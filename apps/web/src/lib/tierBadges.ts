// How each community list's placement is painted: the badge text, its colour,
// and a foreground that reads against it. Shared by the Global Level Page's
// TIERS section and the /search result rows, so a level's placement looks the
// same everywhere — and so the AREDL Legacy rule below exists exactly once.

import { gddlTierColor } from './tierColor'
import {
  isSheetTier,
  readableTextColor,
  sheetTierColor,
  sheetTierName,
  sheetTierSource,
} from './sheetTier'

/**
 * A placement ready to paint. `color` is null for an unpainted badge — a tier
 * whose sheet colour hasn't been transcribed yet, or an AREDL status that is
 * not a rank — which renders on the page's subtle surface instead.
 */
export interface TierBadgeLook {
  badge: string
  color: string | null
  textColor: string
}

/** Each list's favicon, for labelling a badge with the list it came from. */
export const TIER_LIST_ICONS = {
  gddl: '/assets/integrations/gddl.ico',
  aredl: '/assets/integrations/aredl.ico',
  sheet: '/assets/integrations/sheets.svg',
} as const

// AREDL has no community color convention the way the other two lists do (see
// docs/DESIGN_LANGUAGE.md), so its badge is painted from InfernoLog's own
// accent rather than from anything AREDL publishes.
const AREDL_BADGE_COLOR = '#ff9f1c'

/**
 * The text colour for a GDDL tier's badge. Tiers 1–15 sit on light
 * backgrounds, so their number reads black; the palette only darkens from 16
 * up. By tier rather than by luminance because gddlTierColor returns `rgb()`,
 * which readableTextColor (hex only) cannot read.
 */
export function gddlTierTextColor(tier: number): string {
  return tier <= 15 ? '#0d0d0d' : '#f5f5f5'
}

/**
 * A GDDL tier's badge. GDDL exposes decimals but treats the whole number as
 * canonical; it is already rounded on ingestion, and rounded again here so a
 * value cached before that rule existed can't render as "23.98".
 */
export function gddlTierLook(tier: number): TierBadgeLook {
  const whole = Math.round(tier)
  return {
    badge: String(whole),
    color: gddlTierColor(whole),
    textColor: gddlTierTextColor(whole),
  }
}

/**
 * An AREDL placement's badge, or null when the level is not on AREDL at all.
 *
 * ⚠️ THE POSITION IS ONLY A RANK ON THE MAIN LIST. AREDL appends Legacy to the
 * end of the position sequence rather than interleaving it (MainList runs
 * 1-1573, Legacy 1574-1606), so "#1574" would read as "the 1574th hardest
 * level" when it means "removed from the list". A known status other than
 * MainList shows the status instead of the number, unpainted, so it doesn't
 * read as a rank at a glance.
 *
 * A MISSING status with a rank is NOT that case: it means the rank came from
 * the Global Stats Viewer, whose AREDL entry only ever reports main-list
 * placements. `== null` rather than `=== null` on purpose — a payload cached
 * before the status field existed carries undefined, the same "no status
 * known" case.
 */
export function aredlLook(
  rank: number | null,
  status: string | null | undefined
): (TierBadgeLook & { ranked: boolean }) | null {
  if (rank == null && status == null) return null
  const ranked = rank != null && (status == null || status === 'MainList')
  return {
    badge: ranked ? `#${rank}` : (status ?? '—'),
    color: ranked ? AREDL_BADGE_COLOR : null,
    textColor: ranked ? readableTextColor(AREDL_BADGE_COLOR) : '#f5f5f5',
    ranked,
  }
}

/**
 * A sheet tier's badge, carrying which sheet it came from, or null for a value
 * outside the ladder.
 *
 * The badge is the tier's NAME, not its number: the sheets' numbers are an
 * internal index — a reader learns nothing from "20" and everything from
 * "Nightmare". `isSheetTier` rather than a truthiness check, since tier 0 is a
 * real placement.
 */
export function sheetTierLook(
  tier: number | null | undefined
): (TierBadgeLook & { source: 'NLW' | 'LW' }) | null {
  if (!isSheetTier(tier)) return null
  const color = sheetTierColor(tier)
  return {
    badge: sheetTierName(tier) ?? String(tier),
    color,
    // Unpainted badges sit on the page's own surface, so light text reads.
    textColor: color ? readableTextColor(color) : '#f5f5f5',
    // Non-null for any tier isSheetTier accepts.
    source: sheetTierSource(tier)!,
  }
}
