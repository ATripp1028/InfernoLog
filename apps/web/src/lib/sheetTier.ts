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
//
// TODO(palette): replace every PLACEHOLDER below with the sheet's own hex.
// Outstanding: 0 Fuck, 7 Extreme, 9 Relentless, 10 Terrifying,
// 11 Catastrophic, 12 Inexorable, 13 Excruciating, 14 Merciless,
// 15 Monstrous, 16 Apocalyptic, 17 Demonic, 18 Menacing, 19 Unreal,
// 20 Nightmare, 21 Unfathomable.
const PLACEHOLDER = '#3f3f46'

/**
 * Badge background per sheet tier, indexed by tier. The seven filled in here
 * are the ones pinned in docs/DESIGN_LANGUAGE.md; the rest await transcription
 * from the sheet (see PLACEHOLDER).
 */
export const SHEET_TIER_COLORS = [
  PLACEHOLDER, // 0  Fuck
  '#6495ED', // 1  Beginner
  '#00BFFF', // 2  Easy
  '#32CD32', // 3  Medium
  '#FFD700', // 4  Hard
  '#FF8C00', // 5  Very Hard
  '#FF0000', // 6  Insane
  PLACEHOLDER, // 7  Extreme
  '#9400D3', // 8  Remorseless
  PLACEHOLDER, // 9  Relentless
  PLACEHOLDER, // 10 Terrifying
  PLACEHOLDER, // 11 Catastrophic
  PLACEHOLDER, // 12 Inexorable
  PLACEHOLDER, // 13 Excruciating
  PLACEHOLDER, // 14 Merciless
  PLACEHOLDER, // 15 Monstrous
  PLACEHOLDER, // 16 Apocalyptic
  PLACEHOLDER, // 17 Demonic
  PLACEHOLDER, // 18 Menacing
  PLACEHOLDER, // 19 Unreal
  PLACEHOLDER, // 20 Nightmare
  PLACEHOLDER, // 21 Unfathomable
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
