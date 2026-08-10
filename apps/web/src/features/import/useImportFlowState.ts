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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useImportApi,
  useImportStatus,
  importStatusQueryKey,
} from '@/lib/api/import'
import type {
  ImportRowConflict,
  ImportRatingConflict,
  ImportListMerge,
} from '@/lib/api/import'
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
  CONFLICT_SUB_STEP_ORDER,
  EMPTY_CHECK_RESULT,
  EMPTY_ROW_RESOLUTIONS,
  RANKING_MERGE_KEY,
  getValidRatingRows,
  overwriteListOrders,
  overwriteRatingResolutions,
  overwriteRowResolutions,
  type AllFlags,
  type ConflictSubStep,
  type RowResolutions,
  type WizardStep,
} from './importWizardModel'
import { buildImportPayload } from './buildImportPayload'

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
    me.dateFormatPreference as DateFormat
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
  })
  const [completionConflicts, setCompletionConflicts] = useState<
    ImportRowConflict[]
  >([])
  const [progressConflicts, setProgressConflicts] = useState<
    ImportRowConflict[]
  >([])
  const [droppedConflicts, setDroppedConflicts] = useState<ImportRowConflict[]>(
    []
  )
  const [ratingConflicts, setRatingConflicts] = useState<
    ImportRatingConflict[]
  >([])
  const [conflictSubStep, setConflictSubStep] =
    useState<ConflictSubStep>('completions')
  const [completionResolutions, setCompletionResolutions] = useState<
    Map<string, GroupResolution>
  >(new Map())
  const [progressResolutions, setProgressResolutions] = useState<
    Map<string, GroupResolution>
  >(new Map())
  const [droppedResolutions, setDroppedResolutions] = useState<
    Map<string, GroupResolution>
  >(new Map())
  const [ratingResolutions, setRatingResolutions] = useState<
    Map<string, GroupResolution>
  >(new Map())
  const [collectionsMerge, setCollectionsMerge] = useState<ImportListMerge[]>(
    []
  )
  const [rankingMerge, setRankingMerge] = useState<ImportListMerge | null>(null)
  const [listMergeIndex, setListMergeIndex] = useState(0)
  const [resolvedListOrders, setResolvedListOrders] = useState<
    Map<string, string[]>
  >(new Map())
  const [progressLabel, setProgressLabel] = useState('')
  const [commitError, setCommitError] = useState<string | null>(null)
  // Review step's "imported data always wins" checkbox — when set, every
  // conflict the check turns up is auto-resolved as an overwrite and every
  // list merge auto-picks the spreadsheet's order, skipping resolve-conflicts
  // / resolve-lists entirely rather than presenting them for manual review.
  const [blanketOverride, setBlanketOverride] = useState(false)

  // The resolve-lists step's linear sequence — one sub-step per touched
  // collection (from the check response, already filtered to hasConflict
  // ones only), plus Ranking last if present. Derived rather than stored:
  // collectionsMerge/rankingMerge only change once, right after the check
  // call, and stay fixed for the rest of the resolve-lists sub-flow.
  const listMergeQueue = useMemo(
    () => [
      ...collectionsMerge.map((m) => ({ key: m.list!, merge: m })),
      ...(rankingMerge
        ? [{ key: RANKING_MERGE_KEY, merge: rankingMerge }]
        : []),
    ],
    [collectionsMerge, rankingMerge]
  )

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

  // First non-empty sub-step in CONFLICT_SUB_STEP_ORDER, or null if every
  // conflict list is empty (nothing to resolve at all).
  const firstConflictSubStep = (
    completion: ImportRowConflict[],
    progress: ImportRowConflict[],
    dropped: ImportRowConflict[],
    ratings: ImportRatingConflict[]
  ): ConflictSubStep | null => {
    if (completion.length > 0) return 'completions'
    if (progress.length > 0) return 'progress'
    if (dropped.length > 0) return 'dropped'
    if (ratings.length > 0) return 'ratings'
    return null
  }

  const handleSkipFlagged = useCallback(async () => {
    if (!parseResult) return

    const {
      completions,
      progress: progressRows,
      dropped,
    } = validRows(parseResult)
    const ratingRows = getValidRatingRows(parseResult)
    const rankingRows = (parseResult.ranking ?? []).filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        (r.levelId || r.levelName)
    )
    const listRows = (parseResult.lists ?? []).filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        r.list &&
        (r.levelId || r.levelName)
    )

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
      const hasRows =
        completions.length > 0 ||
        dropped.length > 0 ||
        progressRows.length > 0 ||
        ratingRows.length > 0 ||
        rankingRows.length > 0 ||
        listRows.length > 0
      const checkResult = hasRows
        ? await checkConflicts({
            completions: completions.map((r) => ({
              rowIndex: r.rowIndex,
              data: r.data,
            })),
            dropped: dropped.map((r) => ({
              rowIndex: r.rowIndex,
              data: r.data,
            })),
            progress: progressRows.map((r) => ({
              rowIndex: r.rowIndex,
              data: r.data,
            })),
            ratings: ratingRows.map((r) => ({
              levelId: r.levelId,
              levelName: r.levelName,
              creator: r.creator,
              inGameDifficulty: r.inGameDifficulty,
              scores: r.scores,
            })),
            ranking: rankingRows.map((r) => ({
              levelId: r.levelId,
              levelName: r.levelName,
            })),
            collections: listRows.map((r) => ({
              list: r.list as string,
              levelId: r.levelId,
              levelName: r.levelName,
              creator: r.creator,
              inGameDifficulty: r.inGameDifficulty,
              position: r.position,
            })),
          })
        : EMPTY_CHECK_RESULT

      setCompletionConflicts(checkResult.completionConflicts)
      setProgressConflicts(checkResult.progressConflicts)
      setDroppedConflicts(checkResult.droppedConflicts)
      setRatingConflicts(checkResult.ratingConflicts)
      setCollectionsMerge(checkResult.collectionsMerge)
      setRankingMerge(checkResult.rankingMerge)

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

      const firstSubStep = firstConflictSubStep(
        checkResult.completionConflicts,
        checkResult.progressConflicts,
        checkResult.droppedConflicts,
        checkResult.ratingConflicts
      )
      const hasListMerges =
        checkResult.collectionsMerge.length > 0 ||
        checkResult.rankingMerge != null

      if (firstSubStep) {
        setConflictSubStep(firstSubStep)
        setCompletionResolutions(new Map())
        setProgressResolutions(new Map())
        setDroppedResolutions(new Map())
        setRatingResolutions(new Map())
        setStep('resolve-conflicts')
      } else if (hasListMerges) {
        setListMergeIndex(0)
        setResolvedListOrders(new Map())
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
  ])

  // ── Step: resolve-conflicts sub-steps → commit ─────────────────────────
  //
  // Each sub-step's onResolved stores its resolutions, then either advances
  // to the next non-empty sub-step or — if it was the last one — commits
  // with everything accumulated so far. Reads sibling resolutions from
  // component state rather than a param: by the time the LAST sub-step's
  // handler fires, every earlier sub-step has already gone through its own
  // setState + re-render, so the values are current.

  const finishConflictResolution = useCallback(
    async (resolutions: RowResolutions) => {
      if (!parseResult) return
      // A list merge still needs resolving — hand off to resolve-lists
      // rather than committing yet. That step reads these four resolutions
      // back from state once IT finishes (see finishListMergeResolution) —
      // by then they've long since landed via the setState calls the
      // sub-step handlers below already made before calling this function.
      if (listMergeQueue.length > 0) {
        setListMergeIndex(0)
        setResolvedListOrders(new Map())
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
        progressConflicts,
        droppedConflicts
      )
    },
    [
      parseResult,
      validRows,
      startImportJob,
      listMergeQueue,
      progressConflicts,
      droppedConflicts,
    ]
  )

  // ── Step: resolve-lists sub-steps → commit ─────────────────────────────

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
        {
          completion: completionResolutions,
          progress: progressResolutions,
          dropped: droppedResolutions,
          rating: ratingResolutions,
        },
        listOrders,
        progressConflicts,
        droppedConflicts
      )
    },
    [
      parseResult,
      validRows,
      startImportJob,
      progressConflicts,
      droppedConflicts,
      completionResolutions,
      progressResolutions,
      droppedResolutions,
      ratingResolutions,
    ]
  )

  const handleListMergeConfirmed = useCallback(
    (finalOrder: string[]) => {
      const current = listMergeQueue[listMergeIndex]
      if (!current) return
      const nextOrders = new Map(resolvedListOrders).set(
        current.key,
        finalOrder
      )
      setResolvedListOrders(nextOrders)
      if (listMergeIndex + 1 < listMergeQueue.length) {
        setListMergeIndex((i) => i + 1)
      } else {
        void finishListMergeResolution(nextOrders)
      }
    },
    [
      listMergeQueue,
      listMergeIndex,
      resolvedListOrders,
      finishListMergeResolution,
    ]
  )

  const handleListMergeCancelled = useCallback(() => {
    setCollectionsMerge([])
    setRankingMerge(null)
    setListMergeIndex(0)
    setResolvedListOrders(new Map())
    setStep('review')
  }, [])

  const nextConflictSubStep = useCallback(
    (from: ConflictSubStep): ConflictSubStep | null => {
      const idx = CONFLICT_SUB_STEP_ORDER.indexOf(from)
      for (let i = idx + 1; i < CONFLICT_SUB_STEP_ORDER.length; i++) {
        const step = CONFLICT_SUB_STEP_ORDER[i]!
        if (step === 'progress' && progressConflicts.length > 0) return step
        if (step === 'dropped' && droppedConflicts.length > 0) return step
        if (step === 'ratings' && ratingConflicts.length > 0) return step
      }
      return null
    },
    [progressConflicts, droppedConflicts, ratingConflicts]
  )

  const handleCompletionConflictsResolved = useCallback(
    (resolved: Map<string, GroupResolution>) => {
      setCompletionResolutions(resolved)
      const next = nextConflictSubStep('completions')
      if (next) setConflictSubStep(next)
      else
        void finishConflictResolution({
          completion: resolved,
          progress: progressResolutions,
          dropped: droppedResolutions,
          rating: ratingResolutions,
        })
    },
    [
      nextConflictSubStep,
      progressResolutions,
      droppedResolutions,
      ratingResolutions,
      finishConflictResolution,
    ]
  )

  const handleProgressConflictsResolved = useCallback(
    (resolved: Map<string, GroupResolution>) => {
      setProgressResolutions(resolved)
      const next = nextConflictSubStep('progress')
      if (next) setConflictSubStep(next)
      else
        void finishConflictResolution({
          completion: completionResolutions,
          progress: resolved,
          dropped: droppedResolutions,
          rating: ratingResolutions,
        })
    },
    [
      nextConflictSubStep,
      completionResolutions,
      droppedResolutions,
      ratingResolutions,
      finishConflictResolution,
    ]
  )

  const handleDroppedConflictsResolved = useCallback(
    (resolved: Map<string, GroupResolution>) => {
      setDroppedResolutions(resolved)
      const next = nextConflictSubStep('dropped')
      if (next) setConflictSubStep(next)
      else
        void finishConflictResolution({
          completion: completionResolutions,
          progress: progressResolutions,
          dropped: resolved,
          rating: ratingResolutions,
        })
    },
    [
      nextConflictSubStep,
      completionResolutions,
      progressResolutions,
      ratingResolutions,
      finishConflictResolution,
    ]
  )

  const handleRatingConflictsResolved = useCallback(
    (resolved: Map<string, GroupResolution>) => {
      // 'ratings' is always last in CONFLICT_SUB_STEP_ORDER — nothing to
      // advance to.
      setRatingResolutions(resolved)
      void finishConflictResolution({
        completion: completionResolutions,
        progress: progressResolutions,
        dropped: droppedResolutions,
        rating: resolved,
      })
    },
    [
      completionResolutions,
      progressResolutions,
      droppedResolutions,
      finishConflictResolution,
    ]
  )

  const handleConflictsCancelled = useCallback(() => {
    setCompletionConflicts([])
    setProgressConflicts([])
    setDroppedConflicts([])
    setRatingConflicts([])
    setCollectionsMerge([])
    setRankingMerge(null)
    setStep('review')
  }, [])

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
    conflictSubStep,
    completionConflicts,
    progressConflicts,
    droppedConflicts,
    ratingConflicts,
    handleCompletionConflictsResolved,
    handleProgressConflictsResolved,
    handleDroppedConflictsResolved,
    handleRatingConflictsResolved,
    handleConflictsCancelled,

    // List merges
    currentListMerge: listMergeQueue[listMergeIndex] ?? null,
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
