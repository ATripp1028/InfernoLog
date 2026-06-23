// Helpers for mapping a level's metadata onto Geometry Dash art assets.

const GD_ASSET_BASE = '/assets/gd'

// Maps an in-game difficulty label (e.g. "Extreme Demon", "Insane", "Auto")
// onto its difficulty-face asset in public/assets/gd. Search results only carry
// the difficulty string, so demon-ness is inferred from the label itself.
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

export function showsRatedStar(
  inGameDifficulty: string | null,
  rated: boolean | null | undefined
): boolean {
  return !!rated && STARABLE_FACES.has(difficultyFaceName(inGameDifficulty))
}

export const ratedStarSrc = `${GD_ASSET_BASE}/star.png`

// Standard GD non-demon difficulty by star count (1–9). Used by the non-demon
// difficulty-opinion picker, where each button is a star count.
export function starCountToDifficulty(stars: number): string {
  if (stars <= 1) return 'Auto'
  if (stars === 2) return 'Easy'
  if (stars === 3) return 'Normal'
  if (stars <= 5) return 'Hard'
  if (stars <= 7) return 'Harder'
  return 'Insane'
}

// The "fire"/glow that sits behind a difficulty face, by showcase rating.
// Mythic > legendary > epic outrank a plain feature; unrated/rated-only → none.
export type LevelGlow = 'mythic' | 'legendary' | 'epic' | 'featured'

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

export function levelGlowSrc(
  epicValue: number | null | undefined,
  featured: boolean | null | undefined
): string | null {
  const glow = levelGlow(epicValue, featured)
  if (!glow) return null
  // Asset is bg-feature.png (not "featured"); the rest match the glow name.
  return `${GD_ASSET_BASE}/bg-${glow === 'featured' ? 'feature' : glow}.png`
}

// Community-hosted level thumbnail (Prevter's levelthumbs). May 404 for levels
// without a generated thumbnail — callers should degrade gracefully.
export function levelThumbnailUrl(levelId: string): string {
  return `https://levelthumbs.prevter.me/thumbnail/${levelId}`
}

// User-coin icon: silver (verified) vs uncollected (unverified) so the list can
// show whether a level's coins are silver-rated.
export function userCoinSrc(verified: boolean | null | undefined): string {
  return `${GD_ASSET_BASE}/${verified ? 'coin-user' : 'coin-uncollected'}.png`
}

// The gold "secret coin" sprite used by the official main levels.
export const officialCoinSrc = `${GD_ASSET_BASE}/coin-official.png`
