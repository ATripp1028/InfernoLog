import type {
  Device,
  DifficultyOpinion,
  EntryVisibility,
  ExistingCompletion,
  Level,
} from '@/lib/api/logging'

export type FlowPath = 'completion' | 'progress' | 'drop'

export type FlowStep =
  | 'find'
  // Resolving a pre-targeted level for editing (skips `find`). Auto-advances.
  | 'resolving'
  | 'manual'
  | 'c_basics'
  | 'c_rating'
  | 'c_listrefs'
  | 'c_session'
  | 'c_review'
  | 'c_gddl'
  | 'c_success'
  | 'p_core'
  | 'p_session'
  | 'd_main'

export type RatingScoresDraft = Record<string, number>

// One mutable draft shared across every step of the active path. Numeric inputs
// are kept as strings (controlled text fields) and parsed at submit time;
// slider-backed ratings are stored as 0–100 integers (the internal scale).
export interface FlowDraft {
  date: string | null
  dateUncertain: boolean
  attempts: string
  worstFail: string
  worstFailDate: string
  worstFailAlreadyLogged: boolean
  difficultyOpinion: DifficultyOpinion | null
  // Non-demon difficulty opinion as a star count (1–9), only when the opinion
  // is NOT_DEMON_WORTHY.
  difficultyOpinionStars: number | null
  // Ratings — 0–100 internally regardless of display scale.
  enjoyment: number | null
  simpleRating: number | null
  ratingScores: RatingScoresDraft
  // List references
  gddlTier: string
  nlwTier: string
  aredlTier: string
  // Session
  fps: string
  onStream: boolean
  visibility: EntryVisibility
  videoUrl: string
  highlightUrl: string
  notes: string
  // Progress
  progressMode: 'from_zero' | 'from_run'
  percentage: string
  runFrom: string
  runTo: string
  // Drop
  droppedReason: string
  // Coins — bitmask (bit 0 = coin 1, bit 1 = coin 2, bit 2 = coin 3). -1 = unset.
  coinsCollected: number
  // 2-player
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string
  // Device
  device: Device | null
}

function todayDateInput(): string {
  // Local calendar date, not UTC — otherwise "today" can land a day ahead in
  // the evening for negative-UTC timezones (the ISO string has already rolled).
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function emptyDraft(): FlowDraft {
  return {
    date: todayDateInput(),
    dateUncertain: false,
    attempts: '',
    worstFail: '',
    worstFailDate: '',
    worstFailAlreadyLogged: false,
    difficultyOpinion: null,
    difficultyOpinionStars: null,
    enjoyment: null,
    simpleRating: null,
    ratingScores: {},
    gddlTier: '',
    nlwTier: '',
    aredlTier: '',
    fps: '',
    onStream: false,
    visibility: 'PUBLIC',
    videoUrl: '',
    highlightUrl: '',
    notes: '',
    progressMode: 'from_zero',
    percentage: '',
    runFrom: '',
    runTo: '',
    droppedReason: '',
    coinsCollected: 0,
    twoPlayerSolo: null,
    twoPlayerPartner: '',
    device: null,
  }
}

// Serialized ISO date → the yyyy-MM-dd a native <input type="date"> expects.
function isoToDateInput(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

// Pre-populate the completion draft from a prior completion so the wizard edits
// in place ("edit, not replace") rather than starting blank.
export function draftFromExistingCompletion(
  existing: ExistingCompletion
): FlowDraft {
  const draft = emptyDraft()
  draft.date = isoToDateInput(existing.date)
  draft.dateUncertain = existing.dateUncertain
  draft.attempts = existing.attempts != null ? String(existing.attempts) : ''
  draft.worstFail = existing.worstFail != null ? String(existing.worstFail) : ''
  draft.worstFailDate = isoToDateInput(existing.worstFailDate) ?? ''
  draft.worstFailAlreadyLogged = false
  draft.difficultyOpinion = existing.difficultyOpinion
  draft.difficultyOpinionStars = existing.difficultyOpinionStars
  draft.enjoyment = existing.enjoyment
  draft.simpleRating = existing.simpleRating
  draft.ratingScores = Object.fromEntries(
    existing.ratingScores.map((s) => [s.categoryId, s.score])
  )
  draft.fps = existing.fps != null ? String(existing.fps) : ''
  draft.onStream = existing.onStream
  draft.visibility = existing.visibility
  draft.videoUrl = existing.videoUrl ?? ''
  draft.highlightUrl = existing.highlightUrl ?? ''
  draft.notes = existing.notes ?? ''
  for (const ref of existing.listReferences) {
    if (ref.listSource === 'GDDL') draft.gddlTier = ref.tierOrRank
    if (ref.listSource === 'NLW') draft.nlwTier = ref.tierOrRank
    if (ref.listSource === 'AREDL') draft.aredlTier = ref.tierOrRank
  }
  draft.coinsCollected = existing.coinsCollected ?? 0
  draft.twoPlayerSolo = existing.twoPlayerSolo ?? null
  draft.twoPlayerPartner = existing.twoPlayerPartner ?? ''
  draft.device = existing.device ?? null
  return draft
}

export interface ResolvedLevel {
  level: Level
  existingCompletion: ExistingCompletion | null
  suggestedGddlTier: number | null
}
