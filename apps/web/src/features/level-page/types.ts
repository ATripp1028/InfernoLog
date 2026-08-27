/**
 * Everything the level page renders: the level, the user's LevelProgress fields, and every logged update.
 */
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
  listIndex: number | null
  rankPosition: number | null
  completionVideoUrl: string | null
  completionHighlightUrl: string | null
  level: LevelMeta
  progressUpdates: ProgressUpdate[]
  runsGraph: RunsGraphEntry[]
}

/**
 * The level fields the page and its edit modals need. Narrower than the full `Level`.
 */
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

/**
 * One logged event — a progress session, a drop, or the completion.
 */
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

/**
 * One category score on a level, in the internal 0–100 scale.
 */
export interface RatingScore {
  categoryId: string
  score: number
}

/**
 * A single point on the runs graph: one logged attempt range.
 */
export interface RunsGraphEntry {
  progressUpdateId: string | null
  kind: 'from_zero' | 'from_run' | 'completion' | 'worst_fail'
  from: number
  to: number
  // ISO date string, or null when the underlying event has no recorded date.
  // Used to give synthetic (progressUpdateId: null) bars a stable identity —
  // see entryKey in RunsGraph.tsx.
  date: string | null
  droppedAfter: boolean
}
