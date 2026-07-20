// Import API client — background job model: POST /v1/me/import/start
// persists the dataset and kicks off a worker; GET /v1/me/import/status is
// polled for live progress, flagged rows, and (once done) the outcome
// summary. Types are mirrored from @infernolog/core (web pins zod@3, core is
// on zod@4).

import { useAuth } from '../../context/AuthContext'
import { apiFetch } from './client'
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
  userGddlTier?: number | null
  nlwTier?: string | null
  notes?: string | null
  videoUrl?: string | null
  highlightUrl?: string | null
}

// A non-completion progress log — one logged session for a level, distinct
// from its (optional) completion. Multiple rows can exist per level.
// `progressId` is the round-trip identity (populated on export): present +
// matching an existing entry → updates it in place; otherwise a new entry is
// created.
export interface ImportProgressRow {
  progressId?: string | null
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
  device?: Device | null
  enjoyment?: number | null
  notes?: string | null
  highlightUrl?: string | null
  visibility?: EntryVisibility | null
  inGameDifficulty?: string | null
}

// Additive, like ImportProgressRow — a level can be dropped more than once.
// `dropId` round-trips an exact drop entry the same way `progressId` does.
export interface ImportDroppedRow {
  dropId?: string | null
  levelId?: string | null
  levelName?: string | null
  creator?: string | null
  bestProgress?: number | null
  runFrom?: number | null
  runTo?: number | null
  attemptsAtDrop?: number | null
  droppedAt?: string | null
  reason?: string | null
  inGameDifficulty?: string | null
}

// 'drop'      — discard the imported row entirely, keep existing as-is.
// 'duplicate' — system-detected exact duplicate (progress/dropped only,
//               never user-facing) — functionally identical to 'drop'.
// 'overwrite' — `data` is the full imported row, written unconditionally.
// 'merge'     — `data` is the user's field-by-field reconciliation result;
//               identical to 'overwrite' server-side, distinguished only for
//               outcome-reporting text ("merged" vs "overwritten").
export type ImportConflictAction = 'drop' | 'duplicate' | 'overwrite' | 'merge'

export interface ImportCommitCompletionRow {
  type: 'completion'
  rowIndex: number
  data: ImportCompletionRow
  resolution?: ImportConflictAction
}

export interface ImportCommitDroppedRow {
  type: 'dropped'
  rowIndex: number
  data: ImportDroppedRow
  resolution?: ImportConflictAction
}

export interface ImportCommitProgressRow {
  type: 'progress'
  rowIndex: number
  data: ImportProgressRow
  resolution?: ImportConflictAction
}

export type ImportCommitRow =
  | ImportCommitCompletionRow
  | ImportCommitDroppedRow
  | ImportCommitProgressRow

export interface ImportCommitOutcome {
  rowIndex: number
  status: 'committed' | 'updated' | 'skipped' | 'failed'
  reason?: string
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

export interface ImportCollectionEntry {
  // The sheet's `list` column value (reserved keyword or custom name).
  list: string
  levelId?: string | null
  levelName?: string | null
  creator?: string | null
  inGameDifficulty?: string | null
  position?: number | null
}

export interface ImportCollectionsRequest {
  entries: ImportCollectionEntry[]
}

export interface ImportCollectionsResponse {
  lists: { list: string; placed: number }[]
  skipped: { list: string; label: string; reason: string }[]
}

export interface ImportRatingEntry {
  levelId?: string | null
  levelName?: string | null
  creator?: string | null
  inGameDifficulty?: string | null
  // category name → score (0-100, internal scale)
  scores: Record<string, number>
}

export interface ImportRatingsRequest {
  entries: ImportRatingEntry[]
}

export interface ImportRatingsResponse {
  scored: number
  levels: number
  categoriesCreated: string[]
  skipped: { label: string; reason: string }[]
}

// ── Conflict resolution (shared primitives) ─────────────────────────────────
//
// Powers the canonical git-merge-style resolution UI, reused across every tab
// that can conflict: Completions/Progress/Dropped share ImportRowConflict (a
// field-by-field diff); Ratings has its own single-field variant; Ranking and
// Collections share ImportListMerge (an ordered-list merge).

export interface ImportFieldDiff {
  field: string
  existingValue: unknown
  importedValue: unknown
}

export interface ImportRowConflict {
  rowIndex: number
  levelId: string
  levelName: string | null
  matchedId: string | null
  fields: ImportFieldDiff[]
}

export interface ImportDuplicateRow {
  rowIndex: number
}

export interface ImportRatingConflict {
  levelId: string
  levelName: string | null
  categoryName: string
  existingScore: number
  importedScore: number
}

export interface ImportListEntry {
  levelId: string
  levelName: string | null
}

// A git-like merge of two orderings — see computeListMerge on the backend
// for the exact algorithm. A pure insertion (an entry unique to one side
// whose position relative to the shared backbone is unambiguous) auto-
// resolves and never appears here; only a genuine order disagreement, or a
// pure omission (an existing entry the sheet doesn't mention at all),
// produces a non-empty remainder.
export interface ImportListMerge {
  list: string | null // collection name, or null for Ranking
  mergedSeed: ImportListEntry[]
  importedRemainder: ImportListEntry[]
  existingRemainder: ImportListEntry[]
  hasConflict: boolean
}

export interface ImportCheckRequest {
  completions?: { rowIndex: number; data: ImportCompletionRow }[]
  progress?: { rowIndex: number; data: ImportProgressRow }[]
  dropped?: { rowIndex: number; data: ImportDroppedRow }[]
  ratings?: ImportRatingEntry[]
  collections?: ImportCollectionEntry[]
  ranking?: ImportRankingEntry[]
}

export interface ImportCheckResponse {
  completionConflicts: ImportRowConflict[]
  progressConflicts: ImportRowConflict[]
  progressDuplicates: ImportDuplicateRow[]
  droppedConflicts: ImportRowConflict[]
  droppedDuplicates: ImportDuplicateRow[]
  ratingConflicts: ImportRatingConflict[]
  collectionsMerge: ImportListMerge[]
  rankingMerge: ImportListMerge | null
}

export interface ImportStartRequest {
  rows: ImportCommitRow[]
  ranking?: ImportRankingEntry[]
  collections?: ImportCollectionEntry[]
  ratings?: ImportRatingEntry[]
}

export interface ImportStartResponse {
  jobId: string
}

export interface ImportFlaggedRow {
  id: string
  rowIndex: number
  levelName: string | null
  identifier: string | null
  issueMessage: string
  resolved: boolean
}

export interface ImportStatusResponse {
  status: 'running' | 'completed' | 'failed'
  totalRows: number
  processedRows: number
  error: string | null
  outcomeCounts: {
    committed: number
    updated: number
    skipped: number
    failed: number
  }
  flaggedRows: ImportFlaggedRow[]
  rankingResult: ImportRankingResponse | null
  collectionsResult: ImportCollectionsResponse | null
  ratingsResult: ImportRatingsResponse | null
}

export interface ExportCompletion {
  levelId: string
  levelName: string | null
  creator: string | null
  inGameDifficulty: string | null
  date: string | null
  dateUncertain: boolean
  attempts: number | null
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  onStream: boolean
  fps: number | null
  device: string | null
  enjoyment: number | null
  simpleRating: number | null
  difficultyOpinion: string | null
  difficultyOpinionStars: number | null
  coinsCollected: number | null
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string | null
  visibility: string
  notes: string | null
  levelNotes: string | null
  userGddlTier: number | null
  videoUrl: string | null
  highlightUrl: string | null
}

export interface ExportProgress {
  progressId: string
  levelId: string
  levelName: string | null
  creator: string | null
  date: string | null
  dateUncertain: boolean
  attempts: number | null
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  onStream: boolean
  fps: number | null
  device: string | null
  enjoyment: number | null
  notes: string | null
  highlightUrl: string | null
  visibility: string
}

export interface ExportResponse {
  completions: ExportCompletion[]
  progress: ExportProgress[]
  dropped: {
    dropId: string
    levelId: string
    levelName: string | null
    creator: string | null
    inGameDifficulty: string | null
    bestProgress: number | null
    attemptsAtDrop: number | null
    droppedAt: string | null
    reason: string | null
  }[]
  ranking: { rank: number; levelId: string; levelName: string | null }[]
  collections: {
    list: string
    levelId: string
    levelName: string | null
    position: number
  }[]
  ratingCategories: string[]
  ratings: {
    levelId: string
    levelName: string | null
    creator: string | null
    inGameDifficulty: string | null
    scores: Record<string, number>
  }[]
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useImportApi() {
  const { getIdToken } = useAuth()

  const checkConflicts = useCallback(
    async (req: ImportCheckRequest): Promise<ImportCheckResponse> => {
      const token = await getIdToken()
      return apiFetch<ImportCheckResponse>('/v1/me/import/check', {
        method: 'POST',
        token,
        body: req,
      })
    },
    [getIdToken]
  )

  // Persists the full validated dataset (rows + optional ranking/collections/
  // ratings tabs) and kicks off the background worker. The caller then reads
  // progress via useImportStatus() rather than awaiting a result here.
  const startImport = useCallback(
    async (req: ImportStartRequest): Promise<ImportStartResponse> => {
      const token = await getIdToken()
      return apiFetch<ImportStartResponse>('/v1/me/import/start', {
        method: 'POST',
        token,
        body: req,
      })
    },
    [getIdToken]
  )

  // The export is paginated section by section (so no single response can
  // exceed API Gateway's cap). Fetch every section to completion in parallel
  // and stitch them back into one ExportResponse.
  const getExport = useCallback(async (): Promise<ExportResponse> => {
    const token = await getIdToken()
    const PAGE = 500
    const fetchAll = async (section: string): Promise<unknown[]> => {
      const items: unknown[] = []
      let offset = 0
      for (;;) {
        const page = await apiFetch<{ items: unknown[]; hasMore: boolean }>(
          `/v1/me/export?section=${section}&offset=${offset}&limit=${PAGE}`,
          { method: 'GET', token }
        )
        items.push(...page.items)
        if (!page.hasMore) break
        offset += PAGE
      }
      return items
    }
    const [
      completions,
      progress,
      dropped,
      ranking,
      collections,
      ratings,
      categories,
    ] = await Promise.all([
      fetchAll('completions'),
      fetchAll('progress'),
      fetchAll('dropped'),
      fetchAll('ranking'),
      fetchAll('collections'),
      fetchAll('ratings'),
      fetchAll('categories'),
    ])
    return {
      completions: completions as ExportResponse['completions'],
      progress: progress as ExportResponse['progress'],
      dropped: dropped as ExportResponse['dropped'],
      ranking: ranking as ExportResponse['ranking'],
      collections: collections as ExportResponse['collections'],
      ratings: ratings as ExportResponse['ratings'],
      ratingCategories: categories as string[],
    }
  }, [getIdToken])

  return {
    checkConflicts,
    startImport,
    getExport,
  }
}

// ── Background job status (shared app-wide) ────────────────────────────────

export const importStatusQueryKey = ['import-status'] as const

// Always enabled (not keyed by a jobId prop) so it can be mounted app-wide —
// on login/reload it discovers whether a job is still active, per the
// persistent-status requirement (toast/Settings must reappear if so). Polls
// every 2s while running; a `null` result means no current job.
export function useImportStatus() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: importStatusQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<ImportStatusResponse | null> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ImportStatusResponse | null }>(
        '/v1/me/import/status',
        { token, method: 'GET' }
      )
      return data
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 2000 : false,
    retry: false,
  })
}

export function useResolveImportRow() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rowId: string) => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/import/rows/${rowId}/resolve`, {
        token,
        method: 'PATCH',
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importStatusQueryKey })
    },
  })
}

export function useResolveAllImportRows() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const token = await getIdToken()
      await apiFetch('/v1/me/import/resolve-all', { token, method: 'POST' })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importStatusQueryKey })
    },
  })
}
