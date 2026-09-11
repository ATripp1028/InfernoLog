// Prisma selects for the cached-level wire shape, and the mapper that turns a
// selected row into that shape.

import {
  resolveLevelDifficulty,
  type LevelDifficultyFields,
} from './difficulty'
import { toNum, type DecimalLike } from '../../utils/decimal'

/**
 * Columns returned for a cached level (the wire shape, LevelSchema). Excludes
 * internal sync/bookkeeping fields (lastCheckedAt, pending*, sfhCheckedAt).
 */
export const levelDetailSelect = {
  inGameId: true,
  levelType: true,
  isRated: true,
  isDemon: true,
  name: true,
  creator: true,
  inGameDifficulty: true,
  length: true,
  songName: true,
  songAuthor: true,
  // NONG / Song File Hub data (sfhCheckedAt is internal bookkeeping, omitted).
  isNong: true,
  sfhId: true,
  sfhSongName: true,
  sfhYoutubeUrl: true,
  sfhYoutubeVideoId: true,
  sfhDownloadUrl: true,
  sfhFileType: true,
  sfhDownloads: true,
  // Community-list placements (GSV + GDDL + AREDL). communityCheckedAt stays
  // internal (bookkeeping for the re-check gate), the same way sfhCheckedAt does.
  gddlTier: true,
  aredlRank: true,
  aredlStatus: true,
  enjoyment: true,
  sheetTier: true,
  showcaseUrl: true,
  durationSeconds: true,
  // Extended RobTop metadata.
  description: true,
  creatorPlayerId: true,
  creatorAccountId: true,
  stars: true,
  starsRequested: true,
  partialDiff: true,
  downloads: true,
  likes: true,
  disliked: true,
  objectCount: true,
  coins: true,
  coinsVerified: true,
  featured: true,
  featureScore: true,
  epicValue: true,
  twoPlayer: true,
  lowDetailMode: true,
  copiedFromId: true,
  levelVersion: true,
  gameVersion: true,
  officialSongId: true,
  songId: true,
  songLink: true,
  songSize: true,
  dataSource: true,
  verified: true,
} as const

/**
 * The Global Level Page renders everything the logging wire shape carries plus
 * two fields the logging flow omits as internal: delistedAt (drives the amber
 * "frozen as of…" banner) and lastCheckedAt (the frozen-as-of date it shows).
 */
export const levelPageSelect = {
  ...levelDetailSelect,
  delistedAt: true,
  lastCheckedAt: true,
} as const

/**
 * Serializes a {@link levelDetailSelect} / {@link levelPageSelect} row for the
 * wire, resolving `inGameDifficulty` against `stars` — the canonical difficulty
 * for a non-demon, which outranks the stored label. The row-summary equivalent
 * is mapLevel in row.ts; every detail response must go through one of the two,
 * or a stale label reaches the client.
 *
 * It also converts `enjoyment`, a Decimal(5,2) column, to a plain number when
 * the select carries it. Prisma hands Decimal columns back as Decimal
 * instances, which JSON-serialize as STRINGS — so a detail response that
 * skipped this would ship "59.39" where the wire contract promises 59.39.
 * Being the one function every detail response already goes through is exactly
 * what makes it the right place.
 */
export function mapLevelDetail<T extends LevelDifficultyFields>(
  level: T
): LevelDetailWire<T> {
  const wire = { ...level, inGameDifficulty: resolveLevelDifficulty(level) }
  if ('enjoyment' in wire) {
    Object.assign(wire, {
      enjoyment: toNum(wire.enjoyment as DecimalLike | number | null),
    })
  }
  // The one cast: TS can't prove a runtime `in` check satisfies a conditional
  // type over a generic, but the branch above is exactly that condition.
  return wire as unknown as LevelDetailWire<T>
}

/**
 * A selected level row as it leaves {@link mapLevelDetail}: identical, except
 * that `enjoyment` — when the select carries it — is a number instead of a
 * Decimal.
 */
export type LevelDetailWire<T> = T extends {
  enjoyment: DecimalLike | number | null
}
  ? Omit<T, 'enjoyment'> & { enjoyment: number | null }
  : T
