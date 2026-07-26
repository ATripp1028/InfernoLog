import type {
  Device,
  DifficultyOpinion,
  EntryVisibility,
  ExistingCompletion,
  GdVersion,
  Level,
} from '@/lib/api/logging'
import { getViewerTimezone, getZonedParts } from '@/lib/timezone'

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
  // Time-of-day for `date` — `HH:mm` or `''` (no time entered, the common
  // case). `timezone` is only meaningful once `time !== ''`.
  time: string
  timezone: string
  dateUncertain: boolean
  attempts: string
  worstFail: string
  worstFailDate: string
  worstFailTime: string
  worstFailTimezone: string
  worstFailAlreadyLogged: boolean
  // Worst fail date/time mirror `date`/`time`/`timezone` at submit time —
  // the DateTimeField is hidden while this is on.
  worstFailSameDay: boolean
  // The non-demon star values (AUTO..NINE_STAR) carry their own star count —
  // no separate paired field.
  difficultyOpinion: DifficultyOpinion | null
  // Ratings — 0–100 internally regardless of display scale.
  enjoyment: number | null
  simpleRating: number | null
  ratingScores: RatingScoresDraft
  // User's GDDL tier opinion
  userGddlTier: string
  // Session
  fps: string
  percentageVersion: GdVersion | null
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
    time: '',
    timezone: getViewerTimezone(),
    dateUncertain: false,
    attempts: '',
    worstFail: '',
    worstFailDate: '',
    worstFailTime: '',
    worstFailTimezone: getViewerTimezone(),
    worstFailAlreadyLogged: false,
    worstFailSameDay: false,
    difficultyOpinion: null,
    enjoyment: null,
    simpleRating: null,
    ratingScores: {},
    userGddlTier: '',
    fps: '',
    percentageVersion: null,
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

// Serialized ISO date (+ optional IANA zone it was entered in) → the date/time
// input values that pre-populate a DateTimeField. When a zone is present, the
// date is derived in THAT zone rather than sliced from raw UTC — an entry
// logged at 11:58 PM America/New_York is already the next day in UTC, so a
// naive slice would show the wrong calendar date back to the user.
function isoToDateTimeInput(
  iso: string | null,
  timezone: string | null
): { date: string | null; time: string } {
  if (!iso) return { date: null, time: '' }
  if (!timezone) return { date: isoToDateInput(iso), time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: null, time: '' }
  const { year, month, day, hour, minute } = getZonedParts(d, timezone)
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return { date, time }
}

// "Same day" toggle produces a worst-fail instant exactly one second before
// the completion/drop instant (bare dates with no time just match exactly) —
// used to pre-check the toggle when reopening an entry saved that way.
export function isSameDayToggleOn(
  anchorDateRaw: string | null,
  anchorTimezone: string | null,
  worstFailDateRaw: string | null,
  worstFailTimezone: string | null
): boolean {
  if (anchorDateRaw == null || worstFailDateRaw == null) return false
  // The toggle always writes matching timezones for both fields (see
  // sessionDateFields/worstFailDateFields in payload.ts) — a mismatched pair
  // was never produced by the toggle itself (imported/legacy data, most
  // likely), so it can't be "same day toggle on" regardless of timestamps.
  if (anchorTimezone !== worstFailTimezone) return false
  if (anchorTimezone == null) return anchorDateRaw === worstFailDateRaw
  return (
    new Date(worstFailDateRaw).getTime() ===
    new Date(anchorDateRaw).getTime() - 1000
  )
}

// Pre-populate the completion draft from a prior completion so the wizard edits
// in place ("edit, not replace") rather than starting blank.
export function draftFromExistingCompletion(
  existing: ExistingCompletion
): FlowDraft {
  const draft = emptyDraft()
  const session = isoToDateTimeInput(existing.date, existing.dateTimezone)
  draft.date = session.date
  draft.time = session.time
  draft.timezone = existing.dateTimezone ?? getViewerTimezone()
  draft.dateUncertain = existing.dateUncertain
  draft.attempts = existing.attempts != null ? String(existing.attempts) : ''
  draft.worstFail = existing.worstFail != null ? String(existing.worstFail) : ''
  const worstFail = isoToDateTimeInput(
    existing.worstFailDate,
    existing.worstFailDateTimezone
  )
  draft.worstFailDate = worstFail.date ?? ''
  draft.worstFailTime = worstFail.time
  draft.worstFailTimezone = existing.worstFailDateTimezone ?? getViewerTimezone()
  draft.worstFailAlreadyLogged = false
  draft.worstFailSameDay = isSameDayToggleOn(
    existing.date,
    existing.dateTimezone,
    existing.worstFailDate,
    existing.worstFailDateTimezone
  )
  draft.difficultyOpinion = existing.difficultyOpinion
  draft.enjoyment = existing.enjoyment
  draft.simpleRating = existing.simpleRating
  draft.ratingScores = Object.fromEntries(
    existing.ratingScores.map((s) => [s.categoryId, s.score])
  )
  draft.fps = existing.fps != null ? String(existing.fps) : ''
  draft.percentageVersion = existing.percentageVersion ?? null
  draft.onStream = existing.onStream
  draft.visibility = existing.visibility
  draft.videoUrl = existing.videoUrl ?? ''
  draft.highlightUrl = existing.highlightUrl ?? ''
  draft.notes = existing.notes ?? ''
  draft.userGddlTier =
    existing.userGddlTier != null ? String(existing.userGddlTier) : ''
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
