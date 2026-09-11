// Which community-list rows the TIERS section shows, and what each one says.
// Pure derivation — Tiers.tsx only paints what this returns.
//
// All three placements arrive on the level row already merged from the Global
// Stats Viewer, GDDL and AREDL (see EXTERNAL_APIS.md). They are the level's
// REAL, current placements, which is a different thing from
// LevelProgress.userGddlTier — one user's own tier opinion, captured when they
// logged the level and never updated.
//
// How each badge is painted — including AREDL's Legacy rule — lives in
// lib/tierBadges, shared with the /search result rows.

import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { isSheetTier } from '@/lib/sheetTier'
import {
  TIER_LIST_ICONS,
  aredlLook,
  gddlTierLook,
  sheetTierLook,
} from '@/lib/tierBadges'
import { aredlLevelUrl, gddlLevelUrl } from './linkTargets'

/**
 * One list placement, ready to render.
 *
 * `badge` is what goes in the coloured chip — the number for GDDL and AREDL,
 * whose scales readers know, and the tier NAME for the spreadsheets, whose
 * numbers mean nothing outside the sheet itself. `detail` is an optional
 * secondary line, currently unused. `source` marks which of the two
 * spreadsheets a sheet tier came from and is null for every other list.
 */
export interface TierEntry {
  key: 'gddl' | 'aredl' | 'sheet'
  /** The list's name, as the community knows it. */
  label: string
  /**
   * The raw numeric placement. Kept even where it isn't displayed (the
   * spreadsheets show their tier's name instead), because the number is still
   * what the row's meaning hangs on — sheet tier 0 is the one that needs
   * explaining, and matching on a display string to find it would be fragile.
   */
  value: number
  badge: string
  detail: string | null
  source: 'NLW' | 'LW' | null
  /** Badge background, or null to render the badge unpainted. */
  color: string | null
  /** Foreground that reads against `color`. */
  textColor: string
  /** Where the row points, or null when the list has no per-level page. */
  href: string | null
  /** The icon to display next to the tier entry. */
  icon: string
}

const NLW_SPREADSHEET_LINK =
  'https://docs.google.com/spreadsheets/d/1YxUE2kkvhT2E6AjnkvTf-o8iu_shSLbuFkEFcZOvieA/edit?gid=1850281333#gid=1850281333'
const LW_SPREADSHEET_LINK =
  'https://docs.google.com/spreadsheets/d/15YvW2rRQKlkNpdFMTaRt9CWefDkng6BSh6xRDXSw9r8/edit?gid=190861115#gid=190861115'

/**
 * The list placements to render for a level, in list order, skipping any the
 * level doesn't hold.
 *
 * @returns an empty array when the level is on none of the three lists — which
 * is also the section's render gate, since a TIERS section with no tiers reads
 * as a loading failure rather than as "not ranked anywhere".
 */
export function tierEntries(level: GlobalLevelPageData): TierEntry[] {
  const entries: TierEntry[] = []

  if (level.gddlTier != null) {
    const look = gddlTierLook(level.gddlTier)
    entries.push({
      key: 'gddl',
      label: 'GDDL',
      value: Math.round(level.gddlTier),
      badge: look.badge,
      detail: null,
      source: null,
      color: look.color,
      textColor: look.textColor,
      href: gddlLevelUrl(level.inGameId),
      icon: TIER_LIST_ICONS.gddl,
    })
  }

  // AREDL rows exist for a status alone, not just a rank: its Legacy tier is
  // where levels demoted out of extreme go, and that placement is worth showing
  // even though the number attached to it is not a rank (see aredlLook).
  const aredl = aredlLook(level.aredlRank, level.aredlStatus)
  if (aredl) {
    entries.push({
      key: 'aredl',
      label: 'AREDL',
      value: level.aredlRank ?? 0,
      badge: aredl.badge,
      detail: null,
      source: null,
      color: aredl.color,
      textColor: aredl.textColor,
      href: aredlLevelUrl(level.inGameId),
      icon: TIER_LIST_ICONS.aredl,
    })
  }

  // `isSheetTier`, not a truthiness check — tier 0 ("Fuck") is a real
  // placement, and the sheets start at 0.
  if (isSheetTier(level.sheetTier)) {
    const sheet = sheetTierLook(level.sheetTier)!
    entries.push({
      key: 'sheet',
      label: 'Spreadsheet',
      value: level.sheetTier,
      badge: sheet.badge,
      detail: null,
      source: sheet.source,
      color: sheet.color,
      textColor: sheet.textColor,
      // Unlike GDDL and AREDL, the sheets have no per-level anchor — this
      // points at whichever of the two documents holds the tier, and the row's
      // NLW/LW chip is what says which one the reader is about to open.
      href: sheet.source === 'NLW' ? NLW_SPREADSHEET_LINK : LW_SPREADSHEET_LINK,
      icon: TIER_LIST_ICONS.sheet,
    })
  }

  return entries
}
