import type {
  CompletionInput,
  CompletionListReference,
  DropInput,
  Level,
  ProgressInput,
} from '@/lib/api/logging'
import type { MeData } from '@/lib/api/me'
import type { FlowDraft } from './types'

function intOrNull(value: string): number | null {
  const t = value.trim()
  if (t === '') return null
  const n = Number.parseInt(t, 10)
  return Number.isNaN(n) ? null : n
}

function listReferences(draft: FlowDraft): CompletionListReference[] {
  const refs: CompletionListReference[] = []
  if (draft.gddlTier.trim())
    refs.push({ listSource: 'GDDL', tierOrRank: draft.gddlTier.trim() })
  if (draft.nlwTier.trim())
    refs.push({ listSource: 'NLW', tierOrRank: draft.nlwTier.trim() })
  if (draft.aredlTier.trim())
    refs.push({ listSource: 'AREDL', tierOrRank: draft.aredlTier.trim() })
  return refs
}

export function buildCompletionInput(
  level: Level,
  draft: FlowDraft,
  me: MeData
): CompletionInput {
  const refs = listReferences(draft)
  const ratingScores =
    me.ratingMode === 'WEIGHTED'
      ? Object.entries(draft.ratingScores).map(([categoryId, score]) => ({
          categoryId,
          score,
        }))
      : undefined

  return {
    levelId: level.inGameId,
    date: draft.date,
    dateUncertain: draft.dateUncertain,
    attempts: intOrNull(draft.attempts),
    fps: intOrNull(draft.fps),
    onStream: draft.onStream,
    highlightUrl: draft.highlightUrl.trim() || null,
    notes: draft.notes.trim() || null,
    visibility: draft.visibility,
    videoUrl: draft.videoUrl.trim() || null,
    difficultyOpinion: draft.difficultyOpinion,
    enjoyment: draft.enjoyment,
    simpleRating: me.ratingMode === 'SIMPLE' ? draft.simpleRating : null,
    submitToGddl: me.hasGddlApiKey ? draft.submitToGddl : false,
    ...(ratingScores && ratingScores.length ? { ratingScores } : {}),
    ...(refs.length ? { listReferences: refs } : {}),
    ...(me.hasGddlApiKey
      ? { gddlRecordAccepted: draft.gddlRecordAccepted }
      : {}),
  }
}

export function buildProgressInput(level: Level, draft: FlowDraft): ProgressInput {
  const common = {
    enjoyment: draft.enjoyment,
    date: draft.date,
    dateUncertain: draft.dateUncertain,
    attempts: intOrNull(draft.attempts),
    fps: intOrNull(draft.fps),
    onStream: draft.onStream,
    notes: draft.notes.trim() || null,
    visibility: draft.visibility,
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
  return {
    levelId: level.inGameId,
    droppedAt: draft.date,
    attemptsAtDrop: intOrNull(draft.attempts),
    droppedReason: draft.droppedReason.trim() || null,
    visibility: draft.visibility,
  }
}
