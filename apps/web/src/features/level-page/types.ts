export interface LevelPageData {
  levelProgressId: string
  status: 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
  visibility: 'PUBLIC' | 'PRIVATE'
  levelNotes: string | null
  droppedReason: string | null
  droppedAt: string | null
  attemptsAtDrop: number | null
  worstFail: number | null
  createdAt: string
  updatedAt: string
  rankingIndex: number | null
  rankPosition: number | null
  completionVideoUrl: string | null
  completionHighlightUrl: string | null
  level: LevelMeta
  progressUpdates: ProgressUpdate[]
  runsGraph: RunsGraphEntry[]
}

export interface LevelMeta {
  inGameId: string
  name: string | null
  creator: string | null
  levelType: 'CLASSIC' | 'PLATFORMER'
  inGameDifficulty: string | null
  isDemon: boolean
  isRated: boolean
  difficultyFace: string | null
  featured: boolean
  epicValue: number
  length: string | null
  songName: string | null
  songAuthor: string | null
  coins: number | null
  coinsVerified: boolean | null
  twoPlayer: boolean | null
  officialSongId: number | null
}

export interface ProgressUpdate {
  progressUpdateId: string
  isCompletion: boolean
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  attempts: number | null
  date: string | null
  dateUncertain: boolean
  onStream: boolean
  fps: number | null
  enjoyment: number | null
  simpleRating: number | null
  difficultyOpinion: string | null
  difficultyOpinionStars: number | null
  notes: string | null
  videoUrl: string | null
  highlightUrl: string | null
  loggedAt: string
  listReferences: ListReference[]
  ratingScores: RatingScore[]
  coinsCollected: number | null
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string | null
  device: 'pc' | 'mobile' | null
}

export interface ListReference {
  listSource: string
  tierOrRank: string
  atTimeOfLogging: boolean
}

export interface RatingScore {
  categoryId: string
  score: number
}

export interface RunsGraphEntry {
  progressUpdateId: string | null
  kind: string
  from: number
  to: number
  droppedAfter: boolean
}
