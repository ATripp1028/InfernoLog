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
