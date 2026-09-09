// The NLW / LW extreme demon spreadsheet tiers — names, colours, and the one
// rule that decides which of the two sheets a tier belongs to.
//
// InfernoLog receives these as a single 0-21 integer (`Level.sheetTier`, via
// the Global Stats Viewer's "SHEET" list entry). The sheets themselves are two
// documents sharing one continuous tier ladder: 0-13 are the Non-Listworthy
// sheet, 14-21 the Listworthy one. Nothing on the wire says which sheet a tier
// came from — the threshold below is the whole of that knowledge.
//
// ⚠️ TIER 0 IS A REAL TIER. "Fuck" does not mean "easier than Beginner"; it is
// where levels go whose skillset is too niche to rank reliably. Every guard on
// a sheet tier must be `!= null`, never a truthiness check, or tier-0 levels
// silently disappear from the UI.

/** Display names for sheet tiers 0-21, indexed by tier. */
export const SHEET_TIER_NAMES = [
  'Fuck',
  'Beginner',
  'Easy',
  'Medium',
  'Hard',
  'Very Hard',
  'Insane',
  'Extreme',
  'Remorseless',
  'Relentless',
  'Terrifying',
  'Catastrophic',
  'Inexorable',
  'Excruciating',
  'Merciless',
  'Monstrous',
  'Apocalyptic',
  'Demonic',
  'Menacing',
  'Unreal',
  'Nightmare',
  'Unfathomable',
] as const

/**
 * The lowest listworthy tier. At and above this the tier comes from the LW
 * sheet; below it, from the NLW sheet.
 */
export const LISTWORTHY_MIN_TIER = 14

// Stand-in for a tier whose real colour hasn't been transcribed from the sheet
// yet. Deliberately a flat neutral rather than an invented colour: a wrong
// colour on a community tier reads as authoritative and would be believed.

/**
 * Badge background per sheet tier, indexed by tier. The seven filled in here
 * are the ones pinned in docs/DESIGN_LANGUAGE.md; the rest await transcription
 * from the sheet (see PLACEHOLDER).
 */
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

/** The highest tier the sheets define. */
export const MAX_SHEET_TIER = SHEET_TIER_NAMES.length - 1

/** Whether a value is a tier the sheets actually define (0-21). */
export function isSheetTier(tier: number | null | undefined): tier is number {
  return (
    tier != null &&
    Number.isInteger(tier) &&
    tier >= 0 &&
    tier <= MAX_SHEET_TIER
  )
}

/**
 * The tier's name ("Nightmare"), or null for a tier outside the defined range.
 *
 * Out-of-range returns null rather than clamping: a tier we don't recognize is
 * a data problem, and showing it under a neighbouring tier's name would hide
 * that behind a plausible-looking badge.
 */
export function sheetTierName(tier: number | null | undefined): string | null {
  return isSheetTier(tier) ? SHEET_TIER_NAMES[tier]! : null
}

/**
 * Which sheet the tier comes from — the only thing that distinguishes them,
 * since both arrive as one number.
 *
 * @returns null for a tier outside the defined range.
 */
export function sheetTierSource(
  tier: number | null | undefined
): 'NLW' | 'LW' | null {
  if (!isSheetTier(tier)) return null
  return tier >= LISTWORTHY_MIN_TIER ? 'LW' : 'NLW'
}

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
