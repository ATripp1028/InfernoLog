import type { ExistingCompletion, Level } from '@/lib/api/logging'
import type {
  Device,
  DifficultyOpinion,
  EntryVisibility,
  GdVersion,
} from '@/lib/api/wireEnums'
import { getViewerTimezone, getZonedParts } from '@/lib/timezone'
import { isSameDayToggleOn } from '@/lib/sameDayToggle'

/**
 * Which of the three things the user is logging. Chosen up front and decides the step sequence.
 */
export type FlowPath = 'completion' | 'progress' | 'drop'

/**
 * Every step of the logging flow. The `c_`/`p_`/`d_` prefixes name the {@link FlowPath} a step belongs to.
 */
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

/**
 * Draft category scores, keyed by category id, in the internal 0–100 scale.
 */
export type RatingScoresDraft = Record<string, number>

/**
 * One mutable draft shared across every step of the active path. Numeric inputs
 * are kept as strings (controlled text fields) and parsed at submit time;
 * slider-backed ratings are stored as 0–100 integers (the internal scale).
 */
export interface FlowDraft {
  date: string | null
  // Time-of-day for `date` — `HH:mm`, or `''` when the user cleared it to log
  // a bare date. `timezone` is only meaningful once `time !== ''`.
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

// The current local date and time, as the `yyyy-MM-dd`/`HH:mm` strings the
// DateTimeField inputs take. Both are read off ONE `Date` so a call landing
// on the stroke of midnight can't pair yesterday's date with today's time.
// Local, not UTC — otherwise "today" can land a day ahead in the evening for
// negative-UTC timezones (the ISO string has already rolled).
function nowDateTimeInput(): { date: string; time: string } {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` }
}

/**
 * A fresh {@link FlowDraft}. A function, not a constant, so reopening the flow
 * cannot inherit the last run's state.
 *
 * A new entry is seeded with the current date AND time — most logging happens
 * right after the run it describes, and the native time input gives nothing
 * until it is deliberately filled in. The user can still clear the time field
 * to store a bare date. Editing an existing entry overwrites both from what
 * was stored (see {@link draftFromExistingCompletion}), so an entry logged
 * without a time never gains one just by being reopened.
 */
export function emptyDraft(): FlowDraft {
  const now = nowDateTimeInput()
  return {
    date: now.date,
    time: now.time,
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

/**
 * Pre-populate the completion draft from a prior completion so the wizard edits
 * in place ("edit, not replace") rather than starting blank.
 */
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
  draft.worstFailTimezone =
    existing.worstFailDateTimezone ?? getViewerTimezone()
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

/**
 * A level the flow has resolved, together with the user's existing completion when they already beat it.
 */
export interface ResolvedLevel {
  level: Level
  existingCompletion: ExistingCompletion | null
  suggestedGddlTier: number | null
}
