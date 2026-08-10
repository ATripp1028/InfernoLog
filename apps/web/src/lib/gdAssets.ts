// Helpers for mapping a level's metadata onto Geometry Dash art assets.

const GD_ASSET_BASE = '/assets/gd'

/**
 * Maps an in-game difficulty label (e.g. "Extreme Demon", "Insane", "Auto")
 * onto its difficulty-face asset in public/assets/gd. Search results only carry
 * the difficulty string, so demon-ness is inferred from the label itself.
 */
export function difficultyFaceSrc(inGameDifficulty: string | null): string {
  return `${GD_ASSET_BASE}/${difficultyFaceName(inGameDifficulty)}.png`
}

function difficultyFaceName(inGameDifficulty: string | null): string {
  const d = (inGameDifficulty ?? '').toLowerCase()
  if (d.includes('demon')) {
    if (d.includes('extreme')) return 'demon-extreme'
    if (d.includes('insane')) return 'demon-insane'
    if (d.includes('medium')) return 'demon-medium'
    if (d.includes('hard')) return 'demon-hard'
    if (d.includes('easy')) return 'demon-easy'
    return 'demon-hard' // bare "Demon" → hard demon face
  }
  if (d.includes('auto')) return 'difficulty-auto'
  if (d.includes('harder')) return 'difficulty-harder' // before "hard"
  if (d.includes('hard')) return 'difficulty-hard'
  if (d.includes('insane')) return 'difficulty-insane'
  if (d.includes('normal')) return 'difficulty-normal'
  if (d.includes('easy')) return 'difficulty-easy'
  return 'difficulty-na' // unrated / unknown
}

// The "rated star" badge distinguishes a RATED standard-difficulty level from an
// unrated one with the same face (they're visually identical otherwise). Only
// the non-demon, non-auto, non-NA faces (Easy…Insane) need it — demons and autos
// are always rated, and NA only ever applies to unrated levels.
const STARABLE_FACES = new Set([
  'difficulty-easy',
  'difficulty-normal',
  'difficulty-hard',
  'difficulty-harder',
  'difficulty-insane',
])

/**
 * Whether the rated-star badge belongs on this difficulty face.
 *
 * Only the non-demon, non-auto faces need it: those are visually identical
 * rated or not, while demons and autos are always rated and NA is always
 * unrated.
 */
export function showsRatedStar(
  inGameDifficulty: string | null,
  rated: boolean | null | undefined
): boolean {
  return !!rated && STARABLE_FACES.has(difficultyFaceName(inGameDifficulty))
}

/**
 * The rated-star badge sprite. See {@link showsRatedStar} for when it applies.
 */
export const ratedStarSrc = `${GD_ASSET_BASE}/star.png`

/**
 * Standard GD non-demon difficulty by star count (1–9). Used by the non-demon
 * difficulty-opinion picker, where each button is a star count.
 */
export function starCountToDifficulty(stars: number): string {
  if (stars <= 1) return 'Auto'
  if (stars === 2) return 'Easy'
  if (stars === 3) return 'Normal'
  if (stars <= 5) return 'Hard'
  if (stars <= 7) return 'Harder'
  return 'Insane'
}

/**
 * The "fire"/glow that sits behind a difficulty face, by showcase rating.
 * Mythic > legendary > epic outrank a plain feature; unrated/rated-only → none.
 */
export type LevelGlow = 'mythic' | 'legendary' | 'epic' | 'featured'

/**
 * The showcase glow behind a difficulty face, or `null` for none.
 *
 * Mythic outranks legendary outranks epic outranks a plain feature; merely
 * rated earns no glow.
 */
export function levelGlow(
  epicValue: number | null | undefined,
  featured: boolean | null | undefined
): LevelGlow | null {
  if (epicValue === 3) return 'mythic'
  if (epicValue === 2) return 'legendary'
  if (epicValue === 1) return 'epic'
  if (featured) return 'featured'
  return null
}

/**
 * The sprite for {@link levelGlow}, or `null` when the level has no glow.
 */
export function levelGlowSrc(
  epicValue: number | null | undefined,
  featured: boolean | null | undefined
): string | null {
  const glow = levelGlow(epicValue, featured)
  if (!glow) return null
  // Asset is bg-feature.png (not "featured"); the rest match the glow name.
  return `${GD_ASSET_BASE}/bg-${glow === 'featured' ? 'feature' : glow}.png`
}

/**
 * Community-hosted level thumbnail (Prevter's levelthumbs). May 404 for levels
 * without a generated thumbnail — callers should degrade gracefully.
 */
export function levelThumbnailUrl(levelId: string): string {
  return `https://levelthumbs.prevter.me/thumbnail/${levelId}`
}

/**
 * Local fallback shown when a level has no community thumbnail (or the fetch
 * fails, or the level is delisted). Ships in public/ at a 16:9 ratio so it
 * slots into the thumbnail box without shifting layout.
 */
export const levelThumbnailPlaceholder =
  '/assets/infernolog/placeholder-level.png'

/**
 * User-coin icon: silver (verified) vs the greyed uncollected sprite
 * (unverified), so the list can show whether a level's coins are silver-rated.
 *
 * This is the LIST's reading, where "unverified" and "not collected" share a
 * sprite. Where an unverified coin should instead be the silver sprite
 * bronze-tinted, use {@link userCoinSilverSrc} and apply the tint yourself —
 * {@link CoinPicker} does.
 */
export function userCoinSrc(verified: boolean | null | undefined): string {
  return `${GD_ASSET_BASE}/${verified ? 'coin-user' : 'coin-uncollected'}.png`
}

/** The gold "secret coin" sprite used by the official main levels. */
export const officialCoinSrc = `${GD_ASSET_BASE}/coin-official.png`

/**
 * The silver user-coin sprite (verified). Rendered directly (rather than via
 * {@link userCoinSrc}) where an unverified coin should be the SAME sprite
 * bronze-tinted, not the greyed "uncollected" sprite.
 */
export const userCoinSilverSrc = `${GD_ASSET_BASE}/coin-user.png`

/** The greyed-out sprite for a coin the user has not collected. */
export const uncollectedCoinSrc = `${GD_ASSET_BASE}/coin-uncollected.png`

/**
 * Whether a level is one of RobTop's official levels, whose coins are gold
 * secret coins rather than silver user coins.
 *
 * Reads `officialSongId` when the caller's payload carries it (the full
 * `Level`, the edit modals' `LevelMeta`) and falls back to the creator name
 * otherwise. The fallback exists because `LevelListSummary` — what the list
 * and ranking rows hold — deliberately omits `officialSongId`; before this
 * was one function the two readings lived in three modules and disagreed.
 *
 * @param level - Any level-ish object. A missing `officialSongId` means "not
 * carried by this payload", not "not official", which is why it falls through
 * to the creator rather than answering `false`.
 */
export function isOfficialLevel(level: {
  officialSongId?: number | null
  creator?: string | null
}): boolean {
  if (level.officialSongId != null) return true
  if (level.officialSongId === null) return false
  return level.creator?.toLowerCase() === 'robtop'
}

/** The sprite for a COLLECTED coin on `level` — gold for official, silver otherwise. */
export function collectedCoinSrc(level: {
  officialSongId?: number | null
  creator?: string | null
}): string {
  return isOfficialLevel(level) ? officialCoinSrc : userCoinSilverSrc
}

/**
 * GDBrowser-style stat glyphs shown on the Global Level Page's stat cards.
 */
export const gdStatIconSrc = {
  download: `${GD_ASSET_BASE}/downloadicon.png`,
  like: `${GD_ASSET_BASE}/likeicon.png`,
  dislike: `${GD_ASSET_BASE}/dislikeicon.png`,
  length: `${GD_ASSET_BASE}/lengthicon.png`,
  spike: `${GD_ASSET_BASE}/spike.png`,
  info: `${GD_ASSET_BASE}/infoicon.png`,
  edit: `${GD_ASSET_BASE}/editicon.png`,
} as const
