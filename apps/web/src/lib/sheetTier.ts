// The NLW / LW spreadsheet tiers as the UI needs them: the colour palette, and
// a re-export of the ladder itself.
//
// The names, the 0-21 range, and the NLW/LW split live in @infernolog/core —
// apps/api reads the same table to turn AREDL's tier NAME back into a number.
// Colours stay here because they are display only, and are re-exported through
// this module so nothing in apps/web has to know where the split happened.
//
// ⚠️ TIER 0 IS A REAL TIER. "Fuck" does not mean "easier than Beginner"; it is
// where levels go whose skillset is too niche to rank reliably. Every guard on
// a sheet tier must be `!= null`, never a truthiness check, or tier-0 levels
// silently disappear from the UI.

import { isSheetTier } from '@infernolog/core'

export {
  SHEET_TIER_NAMES,
  LISTWORTHY_MIN_TIER,
  MAX_SHEET_TIER,
  isSheetTier,
  sheetTierName,
  sheetTierFromName,
  sheetTierSource,
} from '@infernolog/core'

export const SHEET_TIER_COLORS = [
  '#000000', // 0  Fuck
  '#4a86e8', // 1  Beginner
  '#00ffff', // 2  Easy
  '#00ff00', // 3  Medium
  '#ffff00', // 4  Hard
  '#ff9900', // 5  Very Hard
  '#ff0000', // 6  Insane
  '#ff00ff', // 7  Extreme
  '#9900ff', // 8  Remorseless
  '#b087eb', // 9  Relentless
  '#f19eea', // 10 Terrifying
  '#ea6661', // 11 Catastrophic
  '#ffc183', // 12 Inexorable
  '#ffe599', // 13 Excruciating
  '#a7e58d', // 14 Merciless
  '#5bad96', // 15 Monstrous
  '#528cb1', // 16 Apocalyptic
  '#6d6ab0', // 17 Demonic
  '#9452a2', // 18 Menacing
  '#913869', // 19 Unreal
  '#832828', // 20 Nightmare
  '#c76e00', // 21 Unfathomable
] as const

/** The tier's badge background, or null for a tier outside the defined range. */
export function sheetTierColor(tier: number | null | undefined): string | null {
  return isSheetTier(tier) ? SHEET_TIER_COLORS[tier]! : null
}

/**
 * A readable foreground for a badge painted `hex`, chosen by the background's
 * relative luminance rather than by tier number.
 *
 * Deriving it means the palette above is the only thing that has to change when
 * the real sheet colours land — the tier ladder runs light in the middle and
 * dark at both ends, so a number-based rule would need re-tuning alongside it.
 */
export function readableTextColor(hex: string): string {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return '#f5f5f5'
  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255
  // Rec. 709 luma — close enough for a two-way light/dark decision, and far
  // cheaper than full WCAG contrast ratios against two candidate colours.
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luma > 0.55 ? '#0d0d0d' : '#f5f5f5'
}
