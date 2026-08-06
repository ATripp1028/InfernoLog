// Prisma selects for the cached-level wire shape.

// Columns returned for a cached level (the wire shape, LevelSchema). Excludes
// internal sync/bookkeeping fields (lastCheckedAt, pending*, sfhCheckedAt).
export const levelSelect = {
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

// The Global Level Page renders everything the logging wire shape carries plus
// two fields the logging flow omits as internal: delistedAt (drives the amber
// "frozen as of…" banner) and lastCheckedAt (the frozen-as-of date it shows).
export const pageLevelSelect = {
  ...levelSelect,
  delistedAt: true,
  lastCheckedAt: true,
} as const
