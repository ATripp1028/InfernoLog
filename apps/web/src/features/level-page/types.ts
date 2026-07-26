export interface LevelPageData {
  levelProgressId: string
  status: 'IN_PROGRESS' | 'DROPPED' | 'COMPLETED'
  visibility: 'PUBLIC' | 'PRIVATE'
  levelNotes: string | null
  worstFail: number | null
  worstFailDate: string | null
  worstFailDateTimezone: string | null
  userGddlTier: number | null
  // One current value per level, not per event.
  simpleRating: number | null
  ratingScores: RatingScore[]
  coinsCollected: number | null
  completionTime: number | null
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
  kind: 'PROGRESS' | 'DROP' | 'COMPLETION'
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  attempts: number | null
  date: string | null
  dateTimezone: string | null
  dateUncertain: boolean
  onStream: boolean
  fps: number | null
  percentageVersion: 'TWO_ONE' | 'TWO_TWO' | null
  enjoyment: number | null
  difficultyOpinion: string | null
  notes: string | null
  videoUrl: string | null
  highlightUrl: string | null
  loggedAt: string
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string | null
  device: 'pc' | 'mobile' | null
}

export interface RatingScore {
  categoryId: string
  score: number
}

export interface RunsGraphEntry {
  progressUpdateId: string | null
  kind: 'from_zero' | 'from_run' | 'completion' | 'worst_fail'
  from: number
  to: number
  droppedAfter: boolean
}
