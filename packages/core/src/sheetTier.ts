// The NLW / LW extreme demon spreadsheet tier ladder — the names, the split
// between the two sheets, and the name→index lookup.
//
// Shared because two apps read it from opposite ends. apps/web renders a tier
// as a coloured badge; apps/api ingests one from AREDL, which reports the tier
// by NAME ("Relentless") rather than by number, and needs this table to turn
// that back into the 0-21 integer the `levels` cache stores.
//
// The sheets themselves are two documents sharing one continuous ladder: 0-13
// are the Non-Listworthy sheet, 14-21 the Listworthy one. Nothing on the wire
// says which sheet a tier came from — LISTWORTHY_MIN_TIER is the whole of that
// knowledge.
//
// ⚠️ TIER 0 IS A REAL TIER. "Fuck" does not mean "easier than Beginner"; it is
// where levels go whose skillset is too niche to rank reliably. Every guard on
// a sheet tier must be `!= null`, never a truthiness check, or tier-0 levels
// silently disappear from the UI.
//
// Colours live in apps/web/src/lib/sheetTier.ts — they are display, and the API
// has no use for them.

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

/** The highest tier the sheets define. */
export const MAX_SHEET_TIER = SHEET_TIER_NAMES.length - 1

/** Whether a value is a tier the sheets actually define (0-21). */
export function isSheetTier(tier: number | null | undefined): tier is number {
  return (
    tier != null && Number.isInteger(tier) && tier >= 0 && tier <= MAX_SHEET_TIER
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
 * The tier a name refers to — the inverse of {@link sheetTierName}, and the
 * only way AREDL's `nlw_tier` becomes a storable number.
 *
 * Matched case-insensitively and trimmed, because the name is upstream copy
 * rather than an identifier. An unrecognized name returns null rather than
 * throwing: if the sheets rename a tier, the correct behaviour is to show no
 * placement until this table catches up, not to fail the whole level check.
 *
 * @param name - A tier name as the sheets write it ("Relentless").
 */
export function sheetTierFromName(
  name: string | null | undefined
): number | null {
  if (typeof name !== 'string') return null
  const needle = name.trim().toLowerCase()
  if (needle.length === 0) return null
  const index = SHEET_TIER_NAMES.findIndex((n) => n.toLowerCase() === needle)
  return index === -1 ? null : index
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
