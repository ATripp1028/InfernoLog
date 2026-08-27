// The import flow's whole step machine, held by ImportFlowProvider. Owns the
// parsed sheet, the conflict/list-merge results from /check and the
// resolutions the user makes against them, the commit call, and the
// job-status polling that drives the progress bar.
//
// Every step reads this through useImportFlow() rather than props — same
// shape as the logging flow's LoggingFlowProvider.
//
// Steps only ever move forward automatically; the sole backward moves are
// explicit user actions (a cancel, or "Back to review" after an error).

import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useImportApi,
  useImportStatus,
  importStatusQueryKey,
} from '@/lib/api/import'
import type { ImportRowConflict } from '@/lib/api/import'
import type { GroupResolution } from './FieldConflictMerge'
import type {
  DateFormat,
  ParseResult,
  ParsedCompletionRow,
  ParsedProgressRow,
  ParsedDroppedRow,
} from './parseSpreadsheet'
import type { MeData } from '@/lib/api/me'
import {
  EMPTY_CHECK_RESULT,
  EMPTY_ROW_RESOLUTIONS,
  overwriteListOrders,
  overwriteRatingResolutions,
  overwriteRowResolutions,
  type AllFlags,
  type ConflictSubStep,
  type RowResolutions,
  type WizardStep,
} from './importWizardModel'
import { buildImportPayload } from './buildImportPayload'
import { buildCheckRequest } from './buildCheckRequest'
import { useConflictResolution } from './useConflictResolution'
import { useListMergeResolution } from './useListMergeResolution'

/**
 * Builds the value {@link ImportFlowProvider} provides: the step machine, the parsed workbook, and every resolution map.
 */
export function useImportFlowState({
  me,
  skipConflictCheck,
}: {
  me: MeData
  skipConflictCheck: boolean
}) {
  const { checkConflicts, startImport } = useImportApi()
  const importStatus = useImportStatus()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<WizardStep>('upload')
  const [dateFormat, setDateFormat] = useState<DateFormat>(
    me.dateFormatPreference
  )
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [allFlags, setAllFlags] = useState<AllFlags>({
    completions: [],
    progress: [],
    dropped: [],
    ranking: [],
    lists: [],
    ratings: [],
    duplicates: [],
    legacyTabs: [],
  })
  const conflicts = useConflictResolution()
  const listMerges = useListMergeResolution()

  const [progressLabel, setProgressLabel] = useState('')
  const [commitError, setCommitError] = useState<string | null>(null)
  // Review step's "imported data always wins" checkbox — when set, every
  // conflict the check turns up is auto-resolved as an overwrite and every
  // list merge auto-picks the spreadsheet's order, skipping resolve-conflicts
  // / resolve-lists entirely rather than presenting them for manual review.
  const [blanketOverride, setBlanketOverride] = useState(false)

  // Progress bar during `committing` is driven by the polled job status once
  // the job exists; before that (while startImport is still being called),
  // progressLabel alone carries the message.
  const total = importStatus.data?.totalRows ?? 0
  const processed = importStatus.data?.processedRows ?? 0
  const progress = total > 0 ? (processed / total) * 100 : 0

  // Once the background job finishes (from any tab — this polls shared
  // server state), move from the progress bar to the Done screen.
  useEffect(() => {
    if (step === 'committing' && importStatus.data?.status === 'completed') {
      setStep('success')
    }
    if (step === 'committing' && importStatus.data?.status === 'failed') {
      setCommitError(importStatus.data.error ?? 'Import failed')
    }
  }, [step, importStatus.data])

  // ── Valid rows (excludes error-flagged rows; name-only rows are included) ──
  const validRows = useCallback(
    (result: ParseResult) => ({
      completions: result.completions.filter(
        (r) =>
          !r.flags.some((f) => f.severity === 'error') &&
          (r.data.levelId || r.data.levelName)
      ),
      progress: result.progress.filter(
        (r) =>
          !r.flags.some((f) => f.severity === 'error') &&
          (r.data.levelId || r.data.levelName)
      ),
      dropped: result.dropped.filter(
        (r) =>
          !r.flags.some((f) => f.severity === 'error') &&
          (r.data.levelId || r.data.levelName)
      ),
    }),
    []
  )

  // ── Step: upload → review ──────────────────────────────────────────────

  const handleParsed = useCallback((result: ParseResult, flags: AllFlags) => {
    setParseResult(result)
    setAllFlags(flags)
    setStep('review')
  }, [])

  // ── Commit loop ────────────────────────────────────────────────────────

  // Persists the full dataset in one call and hands off to the background
  // worker — progress from here on is read from useImportStatus(), which
  // keeps working even if this drawer gets closed (see the `committing` step
  // render below and the close button next to it).
  const startImportJob = useCallback(
    async (
      completions: ParsedCompletionRow[],
      progressRows: ParsedProgressRow[],
      dropped: ParsedDroppedRow[],
      resolutions: RowResolutions,
      // Collection name (or RANKING_MERGE_KEY) → the user-merged final
      // order, for whichever lists went through resolve-lists. A list not
      // in this map never needed merging — its original sheet rows are
      // sent unchanged.
      listOrders: Map<string, string[]>,
      // Passed explicitly rather than closed over: a caller that commits
      // straight from the check response (the blanket-override path) calls
      // this in the same tick as setProgressConflicts/setDroppedConflicts,
      // before React has re-rendered — reading component state here would
      // see last render's (stale) value, the same class of bug the
      // queryClient.setQueryData call above works around.
      progressConflictsForCommit: ImportRowConflict[],
      droppedConflictsForCommit: ImportRowConflict[]
    ) => {
      // Wipe any cached status from a previous job *before* the network call
      // — the `committing` step renders (and its completion-detection effect
      // runs) on this same tick, and if a prior import's cached status was
      // still 'completed', that effect would read it as this job already
      // being done and jump straight to the success screen, when the new job
      // hasn't even reached the server yet. `refetch()` below then repopulates
      // it with the real (freshly-created, 'running') status once /start
      // returns.
      queryClient.setQueryData(importStatusQueryKey, null)
      setProgressLabel('Starting import…')
      setCommitError(null)

      const payload = buildImportPayload({
        completions,
        progressRows,
        dropped,
        resolutions,
        listOrders,
        progressConflictsForCommit,
        droppedConflictsForCommit,
        parseResult,
      })

      try {
        await startImport(payload)
        setProgressLabel('Importing…')
        void importStatus.refetch()
      } catch (err) {
        // Stay on `committing` rather than snapping back to review — the
        // step indicator must never revisit an earlier step automatically.
        // The committing render shows this error with an explicit "Back to
        // review" button so any backward move is a deliberate user action.
        setCommitError(
          err instanceof Error ? err.message : 'Failed to start import'
        )
      }
    },
    [startImport, parseResult, importStatus, queryClient]
  )

  // ── Step: review → conflict check / commit ─────────────────────────────

  const handleSkipFlagged = useCallback(async () => {
    if (!parseResult) return

    const {
      completions,
      progress: progressRows,
      dropped,
    } = validRows(parseResult)

    if (skipConflictCheck) {
      // New account (onboarding) — there can be no existing completions to
      // conflict with, so there's nothing to check.
      setStep('committing')
      await startImportJob(
        completions,
        progressRows,
        dropped,
        EMPTY_ROW_RESOLUTIONS,
        new Map(),
        [],
        []
      )
      return
    }

    setStep('checking-conflicts')
    setCommitError(null)

    try {
      const { request, hasRows } = buildCheckRequest({
        parseResult,
        completions,
        progressRows,
        dropped,
      })
      const checkResult = hasRows
        ? await checkConflicts(request)
        : EMPTY_CHECK_RESULT

      conflicts.store(checkResult)
      listMerges.store(checkResult)

      if (blanketOverride) {
        setStep('committing')
        await startImportJob(
          completions,
          progressRows,
          dropped,
          {
            completion: overwriteRowResolutions(
              checkResult.completionConflicts
            ),
            progress: overwriteRowResolutions(checkResult.progressConflicts),
            dropped: overwriteRowResolutions(checkResult.droppedConflicts),
            rating: overwriteRatingResolutions(checkResult.ratingConflicts),
          },
          overwriteListOrders(
            checkResult.collectionsMerge,
            checkResult.rankingMerge
          ),
          checkResult.progressConflicts,
          checkResult.droppedConflicts
        )
        return
      }

      const hasListMerges =
        checkResult.collectionsMerge.length > 0 ||
        checkResult.rankingMerge != null

      if (conflicts.begin(checkResult)) {
        setStep('resolve-conflicts')
      } else if (hasListMerges) {
        listMerges.begin()
        setStep('resolve-lists')
      } else {
        setStep('committing')
        await startImportJob(
          completions,
          progressRows,
          dropped,
          EMPTY_ROW_RESOLUTIONS,
          new Map(),
          checkResult.progressConflicts,
          checkResult.droppedConflicts
        )
      }
    } catch (err) {
      // Stay on `checking-conflicts` — see the comment in startImportJob's
      // catch block for why this must not auto-navigate backward.
      setCommitError(
        err instanceof Error ? err.message : 'Failed to check conflicts'
      )
    }
  }, [
    parseResult,
    validRows,
    checkConflicts,
    startImportJob,
    skipConflictCheck,
    blanketOverride,
    conflicts,
    listMerges,
  ])

  // ── Hand-offs out of the two resolution sub-flows ──────────────────────
  //
  // Each sub-hook walks its own sequence and hands back a completed bundle
  // when it reaches the end; deciding what that means — another sub-flow, or
  // the commit — is this hook's job.

  // Field conflicts are done. A list merge may still be pending, in which
  // case resolve-lists runs next and commits on ITS completion instead,
  // reading these resolutions back from the conflicts hook.
  const finishConflictResolution = useCallback(
    async (resolutions: RowResolutions) => {
      if (!parseResult) return
      if (listMerges.hasMerges) {
        listMerges.begin()
        setStep('resolve-lists')
        return
      }
      const {
        completions,
        progress: progressRows,
        dropped,
      } = validRows(parseResult)
      setStep('committing')
      await startImportJob(
        completions,
        progressRows,
        dropped,
        resolutions,
        new Map(),
        conflicts.progressConflicts,
        conflicts.droppedConflicts
      )
    },
    [parseResult, validRows, startImportJob, listMerges, conflicts]
  )

  // Every list merge is resolved — commit with both sets of decisions.
  const finishListMergeResolution = useCallback(
    async (listOrders: Map<string, string[]>) => {
      if (!parseResult) return
      const {
        completions,
        progress: progressRows,
        dropped,
      } = validRows(parseResult)
      setStep('committing')
      await startImportJob(
        completions,
        progressRows,
        dropped,
        conflicts.resolutions,
        listOrders,
        conflicts.progressConflicts,
        conflicts.droppedConflicts
      )
    },
    [parseResult, validRows, startImportJob, conflicts]
  )

  // One resolver callback per tab. The sub-hook stores and advances; a
  // non-null return means that was the last tab.
  const resolveConflictTab = useCallback(
    (tab: ConflictSubStep) => (resolved: Map<string, GroupResolution>) => {
      const done = conflicts.resolveAndAdvance(tab, resolved)
      if (done) void finishConflictResolution(done)
    },
    [conflicts, finishConflictResolution]
  )

  const handleListMergeConfirmed = useCallback(
    (finalOrder: string[]) => {
      const done = listMerges.confirmAndAdvance(finalOrder)
      if (done) void finishListMergeResolution(done)
    },
    [listMerges, finishListMergeResolution]
  )

  // Cancelling either sub-flow drops what the check found and returns to
  // review — the only backward moves in the wizard, both user-initiated.
  const handleConflictsCancelled = useCallback(() => {
    conflicts.reset()
    listMerges.reset()
    setStep('review')
  }, [conflicts, listMerges])

  const handleListMergeCancelled = useCallback(() => {
    listMerges.reset()
    setStep('review')
  }, [listMerges])

  return {
    step,
    setStep,

    // Upload
    dateFormat,
    setDateFormat,
    handleParsed,

    // Review
    parseResult,
    allFlags,
    handleSkipFlagged: () => void handleSkipFlagged(),
    blanketOverride,
    setBlanketOverride,

    // Field conflicts
    conflictSubStep: conflicts.conflictSubStep,
    completionConflicts: conflicts.completionConflicts,
    progressConflicts: conflicts.progressConflicts,
    droppedConflicts: conflicts.droppedConflicts,
    ratingConflicts: conflicts.ratingConflicts,
    handleCompletionConflictsResolved: resolveConflictTab('completions'),
    handleProgressConflictsResolved: resolveConflictTab('progress'),
    handleDroppedConflictsResolved: resolveConflictTab('dropped'),
    handleRatingConflictsResolved: resolveConflictTab('ratings'),
    handleConflictsCancelled,

    // List merges
    currentListMerge: listMerges.current,
    handleListMergeConfirmed,
    handleListMergeCancelled,

    // Commit + status
    progress,
    progressLabel,
    commitError,
    backToReview: () => {
      setCommitError(null)
      setStep('review')
    },
    status: importStatus.data,
  }
}
