// What the Global Level Page's cards show for a level, derived from the raw
// RobTop snapshot. Every branch that decides between two presentations — a
// like vs a dislike, a gold vs a bronze coin, a real object count vs "unknown"
// — lives here so the components are left rendering the result.

import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'

const SOURCE_LABEL: Record<string, string> = {
  robtop_autofill: 'GD servers',
  manual: 'Manual entry',
  official: 'Official',
}

function formatChecked(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * The provenance footer's segments, in order, for joining with ' · '.
 *
 * Source and verified state are always present; the last-checked date is
 * dropped when absent or unparseable, rather than rendering a "Checked
 * Invalid Date" segment. An unrecognized `dataSource` falls through as its
 * raw value so a new server-side source is visible rather than blank.
 */
export function provenanceParts(level: GlobalLevelPageData): string[] {
  const parts: string[] = [
    `Source: ${SOURCE_LABEL[level.dataSource] ?? level.dataSource}`,
    level.verified ? 'Verified' : 'Unverified',
  ]
  if (level.lastCheckedAt) {
    const checked = formatChecked(level.lastCheckedAt)
    if (checked) parts.push(`Checked ${checked}`)
  }
  return parts
}

/**
 * The Likes stat card's icon and magnitude.
 *
 * GD stores dislikes as a negative like count, so a negative score is shown as
 * a positive number under the dislike icon rather than as "-42 likes".
 */
export function likeDisplay(level: GlobalLevelPageData): {
  negative: boolean
  value: number
} {
  const likes = level.likes ?? 0
  return { negative: likes < 0, value: Math.abs(likes) }
}

/**
 * The coin sprite to repeat, and what it means. See {@link coinDisplay}.
 */
export interface CoinDisplay {
  // How many sprites to render; the count is implied rather than written out.
  count: number
  // Official (RobTop) levels carry gold secret coins; everything else is a
  // user coin.
  official: boolean
  // Unverified custom coins are bronze in-game, rendered by tinting the
  // silver sprite rather than swapping to the greyed "uncollected" one.
  bronze: boolean
  label: string
}

/**
 * The Coins stat card, or `null` for a level with no coins (which renders an
 * em dash rather than an empty row).
 */
export function coinDisplay(level: GlobalLevelPageData): CoinDisplay | null {
  const count = level.coins ?? 0
  if (count <= 0) return null

  const official = level.creator?.toLowerCase() === 'robtop'
  const bronze = !official && !level.coinsVerified
  return {
    count,
    official,
    bronze,
    label: official
      ? 'Secret coin'
      : bronze
        ? 'Unverified (bronze) user coin'
        : 'Verified (silver) user coin',
  }
}

/**
 * The object count to show, or `null` when it is not actually known.
 *
 * getGJLevels21 (the browse endpoint) only reports object count for newer
 * levels; older ones come back as 0. A real level never has 0 objects, so 0
 * means "unknown" and must not render as a count.
 */
export function knownObjectCount(level: GlobalLevelPageData): number | null {
  return level.objectCount ? level.objectCount : null
}

/**
 * Which enjoyment rating to show, and where it came from.
 *
 * Two communities rate enjoyment on scales the API has already reconciled onto
 * 0-100: the Extreme Demon Enjoyment List (via AREDL) and GDDL. Neither covers
 * the other's ground well, so the choice is by level:
 *
 * - **EDEL wins wherever it exists.** It is the more reliable of the two for
 *   the levels it rates, which is what the whole split is for. A level demoted
 *   off AREDL keeps its EDEL score even though it is no longer an extreme —
 *   the score was really collected, and nothing about the demotion invalidates
 *   it.
 * - **GDDL fills in for non-extremes only.** An extreme demon EDEL has not
 *   rated shows no enjoyment at all rather than GDDL's, deliberately.
 *
 * Decided here rather than at ingestion so a level whose difficulty changes
 * re-decides on the next render, with no re-fetch and no stale column.
 *
 * @returns null when neither source has a rating this level may show.
 */
export function enjoymentDisplay(
  level: GlobalLevelPageData
): { value: number; source: 'EDEL' | 'GDDL'; pending: boolean } | null {
  if (level.aredlEnjoyment != null) {
    return {
      value: level.aredlEnjoyment,
      source: 'EDEL',
      // Only EDEL publishes a provisional flag; GDDL scores are never pending.
      pending: level.aredlEnjoymentPending === true,
    }
  }
  if (level.gddlEnjoyment != null && !isExtremeDemon(level)) {
    return { value: level.gddlEnjoyment, source: 'GDDL', pending: false }
  }
  return null
}

// Whether the level is currently an Extreme Demon.
//
// Reads `partialDiff` first (RobTop's machine-readable token) and falls back to
// the display label, since a row cached before that column existed has only the
// label. `startsWith` rather than equality: the token has a `-featured`
// variant, and an exact match would silently miss every featured extreme.
// Punctuation and case are normalized away because the label reaches us as
// "Extreme Demon" from the live API and "EXTREME_DEMON" from older rows.
function isExtremeDemon(level: GlobalLevelPageData): boolean {
  if (level.partialDiff != null) return level.partialDiff.startsWith('demon-extreme')
  const label = level.inGameDifficulty?.toLowerCase().replace(/[^a-z]/g, '')
  return label === 'extremedemon'
}

/**
 * Labels for the flag chips below the stat cards.
 *
 * Only true flags appear — a level without them shows no row at all, never
 * "2-Player: No". Both fields are nullable, so the check is strict.
 */
export function statFlags(level: GlobalLevelPageData): string[] {
  const flags: string[] = []
  if (level.twoPlayer === true) flags.push('2-Player')
  if (level.lowDetailMode === true) flags.push('Low Detail Mode')
  return flags
}

/**
 * Where a non-NONG level's song comes from — an official in-game track, or Newgrounds.
 */
export function songSource(level: GlobalLevelPageData): string {
  return level.officialSongId != null ? 'In-game track' : 'Newgrounds'
}
