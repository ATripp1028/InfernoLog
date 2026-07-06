import type {
  CompletionInput,
  CompletionListReference,
  DifficultyOpinion,
  DropInput,
  GdVersion,
  Level,
  ProgressInput,
} from '@/lib/api/logging'
import type { MeData } from '@/lib/api/me'
import type { FlowDraft } from './types'

// NLW and AREDL are extreme-demon lists (AREDL = All Rated Extreme Demons
// List), so their fields only apply when the level IS an extreme demon or the
// user's difficulty opinion is Extreme. GDDL applies to every rated level.
export function isExtremeContext(
  inGameDifficulty: string | null,
  difficultyOpinion: DifficultyOpinion | null
): boolean {
  return (
    (inGameDifficulty?.toLowerCase().includes('extreme') ?? false) ||
    difficultyOpinion === 'EXTREME'
  )
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

function listReferences(
  draft: FlowDraft,
  allowExtremeLists: boolean
): CompletionListReference[] {
  const refs: CompletionListReference[] = []
  if (draft.gddlTier.trim())
    refs.push({ listSource: 'GDDL', tierOrRank: draft.gddlTier.trim() })
  if (allowExtremeLists && draft.nlwTier.trim())
    refs.push({ listSource: 'NLW', tierOrRank: draft.nlwTier.trim() })
  if (allowExtremeLists && draft.aredlTier.trim())
    refs.push({ listSource: 'AREDL', tierOrRank: draft.aredlTier.trim() })
  return refs
}

export function buildCompletionInput(
  level: Level,
  draft: FlowDraft,
  me: MeData
): CompletionInput {
  const refs = listReferences(
    draft,
    isExtremeContext(level.inGameDifficulty, draft.difficultyOpinion)
  )
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
        worstFailDate: draft.worstFailDate || null,
      }

  return {
    levelId: level.inGameId,
    date: draft.date,
    dateUncertain: draft.dateUncertain,
    attempts: intOrNull(draft.attempts),
    ...worstFailFields,
    fps: intOrNull(draft.fps, me.defaultFps ?? null),
    percentageVersion: draft.percentageVersion ?? me.defaultPercentageVersion ?? 'TWO_TWO',
    onStream: draft.onStream,
    highlightUrl: draft.highlightUrl.trim() || null,
    notes: draft.notes.trim() || null,
    visibility: draft.visibility,
    videoUrl: draft.videoUrl.trim() || null,
    difficultyOpinion: draft.difficultyOpinion,
    difficultyOpinionStars:
      draft.difficultyOpinion === 'NOT_DEMON_WORTHY'
        ? draft.difficultyOpinionStars
        : null,
    enjoyment: draft.enjoyment,
    simpleRating: me.ratingMode === 'SIMPLE' ? draft.simpleRating : null,
    ...(ratingScores && ratingScores.length ? { ratingScores } : {}),
    ...(refs.length ? { listReferences: refs } : {}),
    coinsCollected: level.coins ? draft.coinsCollected : null,
    twoPlayerSolo: level.twoPlayer ? draft.twoPlayerSolo : null,
    twoPlayerPartner:
      level.twoPlayer && draft.twoPlayerSolo === false
        ? draft.twoPlayerPartner.trim() || null
        : null,
    device: draft.device,
  }
}

export function buildProgressInput(
  level: Level,
  draft: FlowDraft,
  defaultFps?: number,
  defaultPercentageVersion?: GdVersion
): ProgressInput {
  const common = {
    enjoyment: draft.enjoyment,
    date: draft.date,
    dateUncertain: draft.dateUncertain,
    attempts: intOrNull(draft.attempts),
    fps: intOrNull(draft.fps, defaultFps ?? null),
    percentageVersion: draft.percentageVersion ?? defaultPercentageVersion ?? 'TWO_TWO',
    onStream: draft.onStream,
    notes: draft.notes.trim() || null,
    visibility: draft.visibility,
    device: draft.device,
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
        worstFailDate: draft.worstFailDate || null,
      }
  return {
    levelId: level.inGameId,
    droppedAt: draft.date,
    attemptsAtDrop: intOrNull(draft.attempts),
    ...worstFailFields,
    droppedReason: draft.droppedReason.trim() || null,
    visibility: draft.visibility,
  }
}
