// Collection identity — the glyph + accent color that brand a collection on
// its index card, hero, and FAB menus. Built-ins have fixed identities (per
// the mocks); custom collections get a stable color from a hash of their id.

import { Heart, HeartCrack, List, Star, type LucideIcon } from 'lucide-react'
import type { CollectionType } from '@infernolog/core'

export interface CollectionIdentity {
  icon: LucideIcon
  // Accent hex — used at full strength on the glyph badge and identity
  // gradient, and at low alpha for the card strip tint.
  color: string
}

const BUILT_IN_IDENTITY: Record<string, CollectionIdentity> = {
  WANT_TO_BEAT: { icon: Star, color: '#e8390e' },
  FAVORITES: { icon: Heart, color: '#ff9f1c' },
  LEAST_FAVORITES: { icon: HeartCrack, color: '#ef4444' },
}

// Custom-collection accents (mock uses blue/green/orange variants).
const CUSTOM_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#ff6b35',
  '#a855f7',
  '#14b8a6',
  '#ec4899',
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function collectionIdentity(
  type: CollectionType | string,
  id: string
): CollectionIdentity {
  const builtIn = BUILT_IN_IDENTITY[type]
  if (builtIn) return builtIn
  return { icon: List, color: CUSTOM_COLORS[hashString(id) % CUSTOM_COLORS.length]! }
}

// rgba() for an accent hex at the given alpha (identity strips, tints).
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function isBuiltIn(type: CollectionType | string): boolean {
  return type !== 'CUSTOM'
}
