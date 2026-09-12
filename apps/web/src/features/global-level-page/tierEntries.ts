// Which community-list rows the TIERS section shows, and what each one says.
// Pure derivation — Tiers.tsx only paints what this returns.
//
// WHICH lists a level is on, and how each placement is painted, is
// lib/communityTiers — shared with the /search result rows and the demon list,
// so the rules that are easy to get wrong (AREDL's Legacy positions, sheet
// tier 0) exist exactly once. This module adds only what the section has that
// a row chip does not: the list's own name as a visible label, and the
// outbound link to its page for the level.

import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'
import { communityTierChips, type CommunityListKey } from '@/lib/communityTiers'
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
  key: CommunityListKey
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

// The section names each list rather than labelling the figure — it has room
// for the name, where a row chip has only the favicon and so has to spell out
// what the number is ("AREDL rank") in its accessible label instead.
const LIST_LABELS: Record<CommunityListKey, string> = {
  gddl: 'GDDL',
  aredl: 'AREDL',
  sheet: 'Spreadsheet',
}

/**
 * The list placements to render for a level, in list order, skipping any the
 * level doesn't hold.
 *
 * @returns an empty array when the level is on none of the three lists — which
 * is also the section's render gate, since a TIERS section with no tiers reads
 * as a loading failure rather than as "not ranked anywhere".
 */
export function tierEntries(level: GlobalLevelPageData): TierEntry[] {
  return communityTierChips(level).map((chip) => ({
    key: chip.key,
    label: LIST_LABELS[chip.key],
    value: chip.value,
    badge: chip.look.badge,
    detail: null,
    source: chip.source,
    color: chip.look.color,
    textColor: chip.look.textColor,
    href: hrefFor(chip.key, level.inGameId, chip.source),
    icon: chip.icon,
  }))
}

/**
 * Where a list's row points. GDDL and AREDL have a page per level; the
 * spreadsheets do not, so their row opens whichever of the two documents holds
 * the tier — and the row's NLW/LW chip is what says which one that is.
 */
function hrefFor(
  key: CommunityListKey,
  inGameId: string,
  source: 'NLW' | 'LW' | null
): string | null {
  if (key === 'gddl') return gddlLevelUrl(inGameId)
  if (key === 'aredl') return aredlLevelUrl(inGameId)
  return source === 'LW' ? LW_SPREADSHEET_LINK : NLW_SPREADSHEET_LINK
}
