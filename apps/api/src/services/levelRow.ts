// Shared row-serialization pieces for level-centric views (classic ranking,
// collections): the LevelListSummary column select, the completion-derived
// badge/attempts, and the official-level metadata patch.

import type { Prisma } from '@prisma/client'
import { OFFICIAL_LEVELS_BY_ID } from '../data/officialLevels'

// Level identity columns for a row (LevelListSummarySchema). Kept in sync with
// the list page's levelListSelect.
export const levelSelect = {
  inGameId: true,
  name: true,
  creator: true,
  levelType: true,
  inGameDifficulty: true,
  isDemon: true,
  isRated: true,
  difficultyFace: true,
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

// The completion update's fields a row needs: attempts (shown next to the
// badge) and the list references (for the badge).
export const completionSelect = {
  where: { isCompletion: true },
  take: 1,
  select: {
    attempts: true,
    listReferences: { select: { listSource: true, tierOrRank: true } },
  },
} satisfies Prisma.LevelProgress$progressUpdatesArgs

export type LevelRow = Prisma.LevelGetPayload<{ select: typeof levelSelect }>
export type CompletionRefs = Prisma.ProgressUpdateGetPayload<{
  select: (typeof completionSelect)['select']
}>[]

// Single badge per row. AREDL gives an exact rank, so it leads for extreme
// demons (the levels AREDL actually ranks); GDDL leads otherwise since it
// covers every demon. NLW / OTHER are kept as data on the completion but never
// surface here. See RANKING_SYSTEM.md / schemas.ts.
export function deriveBadge(
  updates: CompletionRefs,
  inGameDifficulty: string | null
) {
  const refs = updates[0]?.listReferences ?? []
  const gddl = refs.find((r) => r.listSource === 'GDDL')
  const aredl = refs.find((r) => r.listSource === 'AREDL')
  const isExtreme = (inGameDifficulty ?? '').toLowerCase().includes('extreme')
  const order = isExtreme ? [aredl, gddl] : [gddl, aredl]
  for (const ref of order) {
    if (ref) return { listSource: ref.listSource, tierOrRank: ref.tierOrRank }
  }
  return null
}

// Attempts from the completion update (null when not logged).
export function completionAttempts(updates: CompletionRefs): number | null {
  return updates[0]?.attempts ?? null
}

// Official levels (ids 1–38) aren't served by RobTop; their version + coin
// count come from our data file, matching the list page's treatment.
export function mapLevel(level: LevelRow) {
  const official = OFFICIAL_LEVELS_BY_ID.get(level.inGameId)
  return official
    ? { ...level, gameVersion: official.gameVersion, coins: official.coins }
    : level
}
