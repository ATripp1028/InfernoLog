// Which community-list rows the TIERS section shows, and what each one says.
// Pure derivation — Tiers.tsx only paints what this returns.
//
// All three placements arrive on the level row from the Global Stats Viewer
// (see EXTERNAL_APIS.md). They are the level's REAL, current placements, which
// is a different thing from LevelProgress.userGddlTier — one user's own tier
// opinion, captured when they logged the level and never updated.

import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { gddlTierColor } from '@/lib/tierColor'
import {
  isSheetTier,
  readableTextColor,
  sheetTierColor,
  sheetTierName,
  sheetTierSource,
} from '@/lib/sheetTier'
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
}

// AREDL has no community color convention the way the other two lists do (see
// docs/DESIGN_LANGUAGE.md), so its badge is painted from InfernoLog's own
// accent rather than from anything AREDL publishes.
const AREDL_BADGE_COLOR = '#ff9f1c'
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

  // GDDL exposes decimals but treats the whole number as canonical; it is
  // already rounded on ingestion, and rounded again here so a value cached
  // before that rule existed can't render as "23.98".
  if (level.gddlTier != null) {
    const tier = Math.round(level.gddlTier)
    const color = gddlTierColor(tier)
    entries.push({
      key: 'gddl',
      label: 'GDDL',
      value: tier,
      badge: String(tier),
      detail: null,
      source: null,
      color,
      textColor: readableTextColor(color),
      href: gddlLevelUrl(level.inGameId),
    })
  }

  if (level.aredlRank != null) {
    entries.push({
      key: 'aredl',
      label: 'AREDL',
      value: level.aredlRank,
      badge: `#${level.aredlRank}`,
      detail: null,
      source: null,
      color: AREDL_BADGE_COLOR,
      textColor: readableTextColor(AREDL_BADGE_COLOR),
      href: aredlLevelUrl(level.inGameId),
    })
  }

  // `isSheetTier`, not a truthiness check — tier 0 ("Fuck") is a real
  // placement, and the sheets start at 0.
  if (isSheetTier(level.sheetTier)) {
    const color = sheetTierColor(level.sheetTier)
    const source = sheetTierSource(level.sheetTier)
    entries.push({
      key: 'sheet',
      label: 'Spreadsheet',
      value: level.sheetTier,
      // The NAME, not the number. The sheets' tier numbers are an internal
      // index — a reader who doesn't already know the ladder learns nothing
      // from "20" and everything from "Nightmare", so the name is what earns
      // the coloured chip and the number isn't shown at all.
      badge: sheetTierName(level.sheetTier) ?? String(level.sheetTier),
      detail: null,
      source,
      color,
      // Unpainted badges sit on the page's own surface, so light text reads.
      textColor: color ? readableTextColor(color) : '#f5f5f5',
      // Unlike GDDL and AREDL, the sheets have no per-level anchor — this
      // points at whichever of the two documents holds the tier, and the row's
      // NLW/LW chip is what says which one the reader is about to open.
      href:
        source === 'NLW'
          ? NLW_SPREADSHEET_LINK
          : source === 'LW'
            ? LW_SPREADSHEET_LINK
            : null,
    })
  }

  return entries
}
