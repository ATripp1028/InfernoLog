import type {
  CompletionInput,
  Device,
  DropInput,
  GdVersion,
  Level,
  ProgressInput,
} from '@/lib/api/logging'
import type { MeData } from '@/lib/api/me'
import { ApiError } from '@/lib/api/client'
import { zonedTimeToUtc, NonexistentLocalTimeError } from '@/lib/timezone'
import type { FlowDraft } from './types'

// Shared submit-error → toast message mapping for the completion/drop/progress
// steps below — a NonexistentLocalTimeError means the entered date/time falls
// in a DST "spring forward" gap for the selected zone (see zonedTimeToUtc);
// anything else falls back to the ApiError message or a generic fallback.
export function loggingErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof NonexistentLocalTimeError) {
    return "That time doesn't exist in the selected time zone (daylight saving change) — pick a different time."
  }
  return err instanceof ApiError ? err.message : fallback
}

function intOrNull(
  value: string,
  fallback: number | null = null
): number | null {
  const t = value.trim()
  if (t === '') return fallback
  const n = Number.parseInt(t, 10)
  return Number.isNaN(n) ? null : n
}

// The session-date choke point: time empty → byte-identical legacy shape
// (bare date string, no timezone). Time set → converted to the correct UTC
// instant via the entered IANA zone.
function sessionDateFields(
  draft: FlowDraft
): { date: string | null; dateTimezone: string | null } {
  if (!draft.date) return { date: null, dateTimezone: null }
  if (!draft.time) return { date: draft.date, dateTimezone: null }
  return {
    date: zonedTimeToUtc(draft.date, draft.time, draft.timezone).toISOString(),
    dateTimezone: draft.timezone,
  }
}

function worstFailDateFields(
  draft: FlowDraft
): { worstFailDate: string | null; worstFailDateTimezone: string | null } {
  if (draft.worstFailSameDay) {
    if (!draft.date) return { worstFailDate: null, worstFailDateTimezone: null }
    if (!draft.time) return { worstFailDate: draft.date, worstFailDateTimezone: null }
    // Nudge one second earlier than the completion/drop instant so the two
    // events don't collide at minute-only display precision — otherwise
    // event lists that sort by exact timestamp can't tell which came first.
    const instant = zonedTimeToUtc(draft.date, draft.time, draft.timezone)
    return {
      worstFailDate: new Date(instant.getTime() - 1000).toISOString(),
      worstFailDateTimezone: draft.timezone,
    }
  }
  if (!draft.worstFailDate) return { worstFailDate: null, worstFailDateTimezone: null }
  if (!draft.worstFailTime)
    return { worstFailDate: draft.worstFailDate, worstFailDateTimezone: null }
  return {
    worstFailDate: zonedTimeToUtc(
      draft.worstFailDate,
      draft.worstFailTime,
      draft.worstFailTimezone
    ).toISOString(),
    worstFailDateTimezone: draft.worstFailTimezone,
  }
}

export function buildCompletionInput(
  level: Level,
  draft: FlowDraft,
  me: MeData
): CompletionInput {
  const userGddlTier = intOrNull(draft.userGddlTier)
  const ratingScores =
    me.ratingMode === 'WEIGHTED'
      ? Object.entries(draft.ratingScores).map(([categoryId, score]) => ({
          categoryId,
          score,
        }))
      : undefined

  // When the user checks "already logged", omit both worst fail fields so the
  // server leaves the existing LevelProgress.worstFail/worstFailDate untouched.
  const worstFailFields = draft.worstFailAlreadyLogged
    ? {}
    : {
        worstFail: intOrNull(draft.worstFail),
        ...worstFailDateFields(draft),
      }

  return {
    levelId: level.inGameId,
    ...sessionDateFields(draft),
    dateUncertain: draft.dateUncertain,
    attempts: intOrNull(draft.attempts),
    ...worstFailFields,
    fps: intOrNull(draft.fps, me.defaultFps ?? null),
    percentageVersion:
      draft.percentageVersion ?? me.defaultPercentageVersion ?? 'TWO_TWO',
    onStream: draft.onStream,
    highlightUrl: draft.highlightUrl.trim() || null,
    notes: draft.notes.trim() || null,
    visibility: draft.visibility,
    videoUrl: draft.videoUrl.trim() || null,
    difficultyOpinion: draft.difficultyOpinion,
    enjoyment: draft.enjoyment,
    simpleRating: me.ratingMode === 'SIMPLE' ? draft.simpleRating : null,
    ...(ratingScores && ratingScores.length ? { ratingScores } : {}),
    userGddlTier: userGddlTier,
    coinsCollected: level.coins ? draft.coinsCollected : null,
    twoPlayerSolo: level.twoPlayer ? draft.twoPlayerSolo : null,
    twoPlayerPartner:
      level.twoPlayer && draft.twoPlayerSolo === false
        ? draft.twoPlayerPartner.trim() || null
        : null,
    device: draft.device ?? me.defaultDevice ?? null,
  }
}

export function buildProgressInput(
  level: Level,
  draft: FlowDraft,
  defaultFps?: number,
  defaultPercentageVersion?: GdVersion,
  defaultDevice?: Device
): ProgressInput {
  const common = {
    enjoyment: draft.enjoyment,
    ...sessionDateFields(draft),
    dateUncertain: draft.dateUncertain,
    attempts: intOrNull(draft.attempts),
    fps: intOrNull(draft.fps, defaultFps ?? null),
    percentageVersion:
      draft.percentageVersion ?? defaultPercentageVersion ?? 'TWO_TWO',
    onStream: draft.onStream,
    notes: draft.notes.trim() || null,
    visibility: draft.visibility,
    device: draft.device ?? defaultDevice ?? null,
  }
  if (draft.progressMode === 'from_run') {
    return {
      levelId: level.inGameId,
      mode: 'from_run',
      runFrom: intOrNull(draft.runFrom) ?? 0,
      runTo: intOrNull(draft.runTo) ?? 0,
      ...common,
    }
  }
  return {
    levelId: level.inGameId,
    mode: 'from_zero',
    percentage: intOrNull(draft.percentage) ?? 0,
    ...common,
  }
}

export function buildDropInput(level: Level, draft: FlowDraft): DropInput {
  const worstFailFields = draft.worstFailAlreadyLogged
    ? {}
    : {
        worstFail: intOrNull(draft.worstFail),
        ...worstFailDateFields(draft),
      }
  return {
    levelId: level.inGameId,
    ...sessionDateFields(draft),
    attempts: intOrNull(draft.attempts),
    ...worstFailFields,
    notes: draft.droppedReason.trim() || null,
    visibility: draft.visibility,
  }
}
