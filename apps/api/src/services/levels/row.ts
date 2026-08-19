// Shared row-serialization pieces for level-centric views — the classic
// ranking, collections, and The List (GET /v1/me/progress): the
// LevelListSummary column select, the completion-derived badge/attempts, and
// the official-level metadata patch.

import type { Prisma } from '@prisma/client'
import { OFFICIAL_LEVELS_BY_ID } from '../../data/officialLevels'
import { resolveLevelDifficulty } from './difficulty'

/**
 * Level identity columns for a row (LevelListSummarySchema). Shared by the
 * ranking and collections services and by GET /v1/me/progress, which all
 * return the same level summary — previously three hand-synced copies.
 */
export const levelSummarySelect = {
  inGameId: true,
  name: true,
  creator: true,
  levelType: true,
  inGameDifficulty: true,
  // The canonical difficulty for a non-demon: mapLevel resolves the label
  // against it, and rows render it directly as "5★ Harder".
  stars: true,
  isDemon: true,
  isRated: true,
  featured: true,
  epicValue: true,
  length: true,
  songName: true,
  songAuthor: true,
  coins: true,
  coinsVerified: true,
  twoPlayer: true,
  gameVersion: true,
} satisfies Prisma.LevelSelect

/**
 * The completion update's fields a row needs: just attempts (shown next to the badge).
 */
export const completionSelect = {
  where: { kind: 'COMPLETION' },
  take: 1,
  select: {
    attempts: true,
  },
} satisfies Prisma.LevelProgress$progressUpdatesArgs

/** A level as returned by {@link levelSummarySelect}. */
export type LevelRow = Prisma.LevelGetPayload<{
  select: typeof levelSummarySelect
}>
/** The completion updates attached to a row — at most one, per the invariant. */
export type CompletionRefs = Prisma.ProgressUpdateGetPayload<{
  select: (typeof completionSelect)['select']
}>[]

/**
 * Badge sourced from the user's own GDDL tier opinion on LevelProgress.
 */
export function deriveBadge(userGddlTier: number | null) {
  if (userGddlTier == null) return null
  return { gddlTier: userGddlTier }
}

/**
 * Attempts from the completion update (null when not logged).
 */
export function completionAttempts(updates: CompletionRefs): number | null {
  return updates[0]?.attempts ?? null
}

/**
 * Serializes a level row for the wire.
 *
 * Two fixups, both of which every summary view needs, so they live here rather
 * than being repeated per call site:
 *
 * 1. `inGameDifficulty` is resolved against `stars`, which is canonical for a
 *    non-demon (see starDifficulty.ts) — so a stale label never reaches a
 *    client, and clients keep reading one field without knowing the rule.
 * 2. Official levels (ids 1–38) aren't served by RobTop, so their release
 *    version and secret-coin count come from our data file, not the cache.
 */
export function mapLevel(level: LevelRow) {
  const withDifficulty = {
    ...level,
    inGameDifficulty: resolveLevelDifficulty(level),
  }
  const official = OFFICIAL_LEVELS_BY_ID.get(level.inGameId)
  return official
    ? {
        ...withDifficulty,
        gameVersion: official.gameVersion,
        coins: official.coins,
      }
    : withDifficulty
}
