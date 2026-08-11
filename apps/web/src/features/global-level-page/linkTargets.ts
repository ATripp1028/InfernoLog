// Where the Global Level Page's LINKS section points. Pure URL construction
// and the one rule about which rows appear — the component only renders rows.

import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'

// External link builders. AREDL's public level URL isn't pinned in the docs
// yet (the acknowledgments page still lists it as pending); aredl.net is the
// current home, so we point there.

/** The level's page on GDBrowser. */
export const gdBrowserLevelUrl = (id: string) => `https://gdbrowser.com/${id}`

/** A creator's GDBrowser profile, by GD account id (not player id). */
export const gdBrowserUserUrl = (accountId: string) =>
  `https://gdbrowser.com/u/${accountId}`

/** The level's tier page on the Geometry Dash Demon Ladder. */
export const gddlLevelUrl = (id: string) => `https://gdladder.com/level/${id}`

/** The level's page on AREDL. Only meaningful for Extreme Demons. */
export const aredlLevelUrl = (id: string) => `https://aredl.net/list/${id}`

/**
 * A YouTube search scoped to this exact level — "Geometry Dash {name} by
 * {creator} {id}" — which surfaces gameplay/verification videos far more
 * reliably than any single canonical link.
 *
 * A missing name or creator is dropped from the query rather than rendered as
 * a blank term. Spaces become '+' to match YouTube's own URLs.
 */
export function youtubeSearchUrl(level: GlobalLevelPageData): string {
  const query = [
    'Geometry Dash',
    level.name,
    level.creator && `by ${level.creator}`,
    level.inGameId,
  ]
    .filter(Boolean)
    .join(' ')
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query).replace(/%20/g, '+')}`
}

/**
 * The level this one was copied from, or `null` when there is no row to show.
 *
 * A reupload shares the original's in-game id, so a self-referential
 * `copiedFromId` would render a "Copied from" link pointing at the page the
 * user is already on.
 */
export function copiedFromLevelId(level: GlobalLevelPageData): string | null {
  if (level.copiedFromId == null) return null
  if (level.copiedFromId === level.inGameId) return null
  return level.copiedFromId
}
