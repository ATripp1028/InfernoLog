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

export type Device = 'pc' | 'mobile'
export type EntryVisibility = 'PUBLIC' | 'PRIVATE'

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
  difficultyOpinionStars?: number | null
  coinsCollected?: number | null
  twoPlayerSolo?: boolean | null
  twoPlayerPartner?: string | null
  device?: Device | null
  visibility?: EntryVisibility | null
  levelNotes?: string | null
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
  inGameDifficulty?: string | null
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
  status: 'committed' | 'updated' | 'skipped' | 'failed'
  reason?: string
}

export interface ImportCommitResponse {
  outcomes: ImportCommitOutcome[]
}

export interface ImportRankingEntry {
  levelId?: string | null
  levelName?: string | null
}

export interface ImportRankingRequest {
  // Ordered hardest → easiest.
  entries: ImportRankingEntry[]
}

export interface ImportRankingResponse {
  placed: number
  skipped: { rank: number; label: string; reason: string }[]
}

export interface ImportListEntry {
  list: string
  levelId?: string | null
  levelName?: string | null
  creator?: string | null
  inGameDifficulty?: string | null
  position?: number | null
}

export interface ImportListsRequest {
  entries: ImportListEntry[]
}

export interface ImportListsResponse {
  lists: { list: string; placed: number }[]
  skipped: { list: string; label: string; reason: string }[]
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

  const commitRanking = useCallback(
    async (req: ImportRankingRequest): Promise<ImportRankingResponse> => {
      const token = await getIdToken()
      return apiFetch<ImportRankingResponse>('/v1/me/import/ranking', {
        method: 'POST',
        token,
        body: req,
      })
    },
    [getIdToken]
  )

  const commitLists = useCallback(
    async (req: ImportListsRequest): Promise<ImportListsResponse> => {
      const token = await getIdToken()
      return apiFetch<ImportListsResponse>('/v1/me/import/lists', {
        method: 'POST',
        token,
        body: req,
      })
    },
    [getIdToken]
  )

  return { checkConflicts, commitBatch, commitRanking, commitLists }
}
