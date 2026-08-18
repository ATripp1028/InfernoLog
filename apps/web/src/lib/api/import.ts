// Import API client — background job model: POST /v1/me/import/start
// persists the dataset and kicks off a worker; GET /v1/me/import/status is
// polled for live progress, flagged rows, and (once done) the outcome
// summary. Types are mirrored from @infernolog/core (web pins zod@3, core is
// on zod@4).
//
// The conflict types below power one git-merge-style resolution UI reused
// across every tab that can conflict: Completions/Progress/Dropped share
// ImportRowConflict (a field-by-field diff), Ratings has its own single-field
// variant, and Ranking/Collections share ImportListMerge (an ordered-list
// merge).

import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Device, DifficultyOpinion, EntryVisibility } from './wireEnums'

/**
 * One Completions-tab row as parsed from the sheet.
 *
 * Every field is optional and nullable: the sheet is user-authored, so a
 * missing column is normal and validation happens server-side. `levelId` may
 * be absent when only a `levelName` was given — those rows are resolved by
 * name during the import.
 */
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

/**
 * A non-completion progress log — one logged session for a level, distinct
 * from its (optional) completion. Multiple rows can exist per level.
 * `progressId` is the round-trip identity (populated on export): present +
 * matching an existing entry → updates it in place; otherwise a new entry is
 * created.
 */
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

/**
 * Additive, like ImportProgressRow — a level can be dropped more than once.
 * `dropId` round-trips an exact drop entry the same way `progressId` does.
 */
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

/**
 * 'drop'      — discard the imported row entirely, keep existing as-is.
 * 'duplicate' — system-detected exact duplicate (progress/dropped only,
 *               never user-facing) — functionally identical to 'drop'.
 * 'overwrite' — `data` is the full imported row, written unconditionally.
 * 'merge'     — `data` is the user's field-by-field reconciliation result;
 *               identical to 'overwrite' server-side, distinguished only for
 *               outcome-reporting text ("merged" vs "overwritten").
 */
export type ImportConflictAction = 'drop' | 'duplicate' | 'overwrite' | 'merge'

/**
 * A Completions row queued for commit, tagged so the worker can route it. `resolution` is only set for a row that conflicted.
 */
export interface ImportCommitCompletionRow {
  type: 'completion'
  rowIndex: number
  data: ImportCompletionRow
  resolution?: ImportConflictAction
}

/**
 * A Dropped row queued for commit. See {@link ImportCommitCompletionRow}.
 */
export interface ImportCommitDroppedRow {
  type: 'dropped'
  rowIndex: number
  data: ImportDroppedRow
  resolution?: ImportConflictAction
}

/**
 * A Progress row queued for commit. See {@link ImportCommitCompletionRow}.
 */
export interface ImportCommitProgressRow {
  type: 'progress'
  rowIndex: number
  data: ImportProgressRow
  resolution?: ImportConflictAction
}

/**
 * Any row queued for commit, discriminated by `type`.
 */
export type ImportCommitRow =
  | ImportCommitCompletionRow
  | ImportCommitDroppedRow
  | ImportCommitProgressRow

/**
 * What happened to one committed row. `reason` is set for `skipped` and `failed` only.
 */
export interface ImportCommitOutcome {
  rowIndex: number
  status: 'committed' | 'updated' | 'skipped' | 'failed'
  reason?: string
}

/**
 * One Ranking-tab entry. Identified by `levelId` when the sheet gave one, otherwise resolved from `levelName`.
 */
export interface ImportRankingEntry {
  levelId?: string | null
  levelName?: string | null
}

/**
 * The Ranking tab as an ordered list, hardest first.
 */
export interface ImportRankingRequest {
  // Ordered hardest → easiest.
  entries: ImportRankingEntry[]
}

/**
 * How much of the ranking landed, and why anything was left out.
 */
export interface ImportRankingResponse {
  placed: number
  skipped: { rank: number; label: string; reason: string }[]
}

/**
 * One Lists-tab entry. `list` is the sheet's raw list name — a reserved keyword for a built-in collection, or a custom collection's name.
 */
export interface ImportCollectionEntry {
  // The sheet's `list` column value (reserved keyword or custom name).
  list: string
  levelId?: string | null
  levelName?: string | null
  creator?: string | null
  inGameDifficulty?: string | null
  position?: number | null
}

/**
 * The Lists tab, across all collections.
 */
export interface ImportCollectionsRequest {
  entries: ImportCollectionEntry[]
}

/**
 * Per-collection placement counts, and the entries that were skipped.
 */
export interface ImportCollectionsResponse {
  lists: { list: string; placed: number }[]
  skipped: { list: string; label: string; reason: string }[]
}

/**
 * One Ratings-tab entry. `scores` is keyed by category NAME (the sheet has no ids) with internal 0–100 values.
 */
export interface ImportRatingEntry {
  levelId?: string | null
  levelName?: string | null
  creator?: string | null
  inGameDifficulty?: string | null
  // category name → score (0-100, internal scale)
  scores: Record<string, number>
}

/**
 * The Ratings tab.
 */
export interface ImportRatingsRequest {
  entries: ImportRatingEntry[]
}

/**
 * Rating import results. `categoriesCreated` names categories the sheet introduced that the account did not have.
 */
export interface ImportRatingsResponse {
  scored: number
  levels: number
  categoriesCreated: string[]
  skipped: { label: string; reason: string }[]
}

/**
 * One field where the sheet and InfernoLog disagree. Values are untyped because the diff spans every column type.
 */
export interface ImportFieldDiff {
  field: string
  existingValue: unknown
  importedValue: unknown
}

/**
 * A row whose level already has an entry, with the fields that differ.
 *
 * `matchedId` is the existing record this row matched; `null` means the match
 * was by level rather than by round-trip identity.
 */
export interface ImportRowConflict {
  rowIndex: number
  levelId: string
  levelName: string | null
  matchedId: string | null
  fields: ImportFieldDiff[]
}

/**
 * A row that duplicates another row in the same sheet, by index.
 */
export interface ImportDuplicateRow {
  rowIndex: number
}

/**
 * A single category score that disagrees with the stored one. Ratings conflict per category, not per row.
 */
export interface ImportRatingConflict {
  levelId: string
  levelName: string | null
  categoryName: string
  existingScore: number
  importedScore: number
}

/**
 * One level inside an ordered-list merge.
 */
export interface ImportListEntry {
  levelId: string
  levelName: string | null
}

/**
 * A git-like merge of two orderings — see computeListMerge on the backend
 * for the exact algorithm. A pure insertion (an entry unique to one side
 * whose position relative to the shared backbone is unambiguous) auto-
 * resolves and never appears here; only a genuine order disagreement, or a
 * pure omission (an existing entry the sheet doesn't mention at all),
 * produces a non-empty remainder.
 */
export interface ImportListMerge {
  list: string | null // collection name, or null for Ranking
  mergedSeed: ImportListEntry[]
  importedRemainder: ImportListEntry[]
  existingRemainder: ImportListEntry[]
  hasConflict: boolean
  // The two full original orderings, un-merged — lets the merge board offer
  // "just use the spreadsheet" / "just keep InfernoLog's order" as one-click
  // bulk resolutions.
  importedOrder: ImportListEntry[]
  existingOrder: ImportListEntry[]
}

/**
 * Everything the /check pass needs to find conflicts before anything is written. Every tab is optional.
 */
export interface ImportCheckRequest {
  completions?: { rowIndex: number; data: ImportCompletionRow }[]
  progress?: { rowIndex: number; data: ImportProgressRow }[]
  dropped?: { rowIndex: number; data: ImportDroppedRow }[]
  ratings?: ImportRatingEntry[]
  collections?: ImportCollectionEntry[]
  ranking?: ImportRankingEntry[]
}

/**
 * Every conflict the /check pass found, grouped by the resolver that handles it. `rankingMerge` is `null` when the sheet has no Ranking tab.
 */
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

/**
 * The whole resolved import. Sent once; the server persists it and runs it in a worker.
 */
export interface ImportStartRequest {
  rows: ImportCommitRow[]
  ranking?: ImportRankingEntry[]
  collections?: ImportCollectionEntry[]
  ratings?: ImportRatingEntry[]
}

/**
 * The job id for the started import. Progress comes from {@link useImportStatus}, not from this.
 */
export interface ImportStartResponse {
  jobId: string
}

/**
 * A row the worker could not finish on its own. `resolved` flips once the user answers it via {@link useResolveImportRow}.
 */
export interface ImportFlaggedRow {
  id: string
  rowIndex: number
  levelName: string | null
  identifier: string | null
  issueMessage: string
  resolved: boolean
}

/**
 * Live progress of the running import, and — once `status` leaves `running` — its full outcome.
 */
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

/**
 * One completion in the account export. Shaped for the spreadsheet, so ids that make the export re-importable are included.
 */
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

/**
 * One progress log in the account export. `progressId` is the round-trip identity that lets a re-import update in place.
 */
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

/**
 * Everything in the account, in the same tab structure the import template uses — an export re-imports cleanly.
 */
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

/**
 * The one-shot import calls: template check, start, and export. Polling lives in {@link useImportStatus}.
 */
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

/**
 * Cache key for the import job poll. One key app-wide — the job is per user, so it survives navigation and reload.
 */
export const importStatusQueryKey = ['import-status'] as const

/**
 * Always enabled (not keyed by a jobId prop) so it can be mounted app-wide —
 * on login/reload it discovers whether a job is still active, per the
 * persistent-status requirement (toast/Settings must reappear if so). Polls
 * every 2s while running; a `null` result means no current job. Read-only:
 * several components call this to display status, but only the app-shell
 * singleton (ImportStatusToast) fires the completion side effect — putting
 * it here too would replay it on every remount of every consumer.
 */
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

/**
 * Answers one {@link ImportFlaggedRow}, unblocking the worker on that row.
 */
export function useResolveImportRow() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rowId: string) => {
      const token = await getIdToken()
      await apiFetch(
        `/v1/me/import/rows/${encodeURIComponent(rowId)}/resolve`,
        {
          token,
          method: 'PATCH',
        }
      )
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: importStatusQueryKey })
    },
  })
}

/**
 * Applies the same answer to every outstanding flagged row at once.
 */
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
