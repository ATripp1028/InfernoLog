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
