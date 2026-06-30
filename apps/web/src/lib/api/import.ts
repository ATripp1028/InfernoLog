// Import API client — wraps POST /v1/me/import/check and POST /v1/me/import.
// Types are mirrored from @infernolog/core (web pins zod@3, core is on zod@4).

import { useAuth } from '../../context/AuthContext'
import { apiFetch } from './client'
import { useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export type DifficultyOpinion =
  | 'NOT_DEMON_WORTHY'
  | 'EASY'
  | 'MEDIUM'
  | 'HARD'
  | 'INSANE'
  | 'EXTREME'

export interface ImportConflict {
  levelId: string
  levelName: string | null
  date: string | null
  attempts: number | null
  enjoyment: number | null
  simpleRating: number | null
  difficultyOpinion: DifficultyOpinion | null
}

export interface ImportCheckResponse {
  conflicts: ImportConflict[]
}

export interface ImportCompletionRow {
  levelId?: string | null
  levelName?: string | null
  creator?: string | null
  date?: string | null
  dateUncertain?: boolean | null
  attempts?: number | null
  percentage?: number | null
  runFrom?: number | null
  runTo?: number | null
  onStream?: boolean | null
  fps?: number | null
  enjoyment?: number | null
  simpleRating?: number | null
  difficultyOpinion?: DifficultyOpinion | null
  inGameDifficulty?: string | null
  gddlTier?: number | null
  nlwTier?: string | null
  notes?: string | null
  videoUrl?: string | null
  highlightUrl?: string | null
}

export interface ImportDroppedRow {
  levelId?: string | null
  levelName?: string | null
  creator?: string | null
  bestProgress?: number | null
  runFrom?: number | null
  runTo?: number | null
  attemptsAtDrop?: number | null
  droppedAt?: string | null
  reason?: string | null
  gddlTierAtDrop?: number | null
}

export type ConflictResolution = 'skip' | 'overwrite'

export interface ImportCommitCompletionRow {
  type: 'completion'
  rowIndex: number
  data: ImportCompletionRow
  conflictResolution?: ConflictResolution
}

export interface ImportCommitDroppedRow {
  type: 'dropped'
  rowIndex: number
  data: ImportDroppedRow
}

export type ImportCommitRow = ImportCommitCompletionRow | ImportCommitDroppedRow

export interface ImportCommitRequest {
  importJobId: string
  rows: ImportCommitRow[]
}

export interface ImportCommitOutcome {
  rowIndex: number
  status: 'committed' | 'skipped' | 'failed'
  reason?: string
}

export interface ImportCommitResponse {
  outcomes: ImportCommitOutcome[]
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useImportApi() {
  const { getIdToken } = useAuth()

  const checkConflicts = useCallback(
    async (levelIds: string[]): Promise<ImportCheckResponse> => {
      const token = await getIdToken()
      return apiFetch<ImportCheckResponse>('/v1/me/import/check', {
        method: 'POST',
        token,
        body: { levelIds },
      })
    },
    [getIdToken]
  )

  const commitBatch = useCallback(
    async (req: ImportCommitRequest): Promise<ImportCommitResponse> => {
      const token = await getIdToken()
      return apiFetch<ImportCommitResponse>('/v1/me/import', {
        method: 'POST',
        token,
        body: req,
      })
    },
    [getIdToken]
  )

  return { checkConflicts, commitBatch }
}
