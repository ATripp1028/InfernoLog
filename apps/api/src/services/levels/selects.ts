// Prisma selects for the cached-level wire shape, and the mapper that turns a
// selected row into that shape.

import {
  resolveLevelDifficulty,
  type LevelDifficultyFields,
} from './difficulty'

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
 */
export function mapLevelDetail<T extends LevelDifficultyFields>(level: T): T {
  return { ...level, inGameDifficulty: resolveLevelDifficulty(level) }
}
