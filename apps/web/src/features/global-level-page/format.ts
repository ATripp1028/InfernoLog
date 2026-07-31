import type { GlobalLevelPageData } from '@/lib/api/globalLevelPage'

// Human-readable song size from the raw megabyte float (e.g. 9.56 → "9.56 MB").
export function formatSongSize(mb: number | null): string | null {
  if (mb == null) return null
  return `${mb.toFixed(2)} MB`
}

// The combined "GD VERSION" stat: the game version the level targets plus its
// own edit revision (e.g. "2.2 · rev 3"). Either half may be missing.
export function formatGameVersion(
  gameVersion: string | null,
  levelVersion: number | null
): string {
  const parts: string[] = []
  if (gameVersion) parts.push(gameVersion)
  if (levelVersion != null) parts.push(`rev ${levelVersion}`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export type ShowcaseTier = 'mythic' | 'legendary' | 'epic' | 'featured'

// Showcase status, mirroring gdAssets.levelGlow — the glow behind the face
// carries this visually; the Identity pill labels it in words.
export function showcaseTier(level: {
  epicValue: number | null
  featured: boolean | null
}): ShowcaseTier | null {
  if (level.epicValue === 3) return 'mythic'
  if (level.epicValue === 2) return 'legendary'
  if (level.epicValue === 1) return 'epic'
  if (level.featured) return 'featured'
  return null
}

const SHOWCASE_LABEL: Record<ShowcaseTier, string> = {
  mythic: 'Mythic',
  legendary: 'Legendary',
  epic: 'Epic',
  featured: 'Featured',
}

export function showcaseLabel(tier: ShowcaseTier): string {
  return SHOWCASE_LABEL[tier]
}

// AREDL only ranks Extreme Demons, so the AREDL link renders for those alone.
export function isExtremeDemon(level: GlobalLevelPageData): boolean {
  return (
    level.isDemon && (level.inGameDifficulty ?? '').toLowerCase().includes('extreme')
  )
}
