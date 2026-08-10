// The resolve-conflicts sub-flow's state: the four tabs' conflicts as the
// check returned them, the resolutions the user makes against each, and the
// linear sub-step sequence walking Completions → Progress → Dropped → Ratings
// with empty tabs skipped.
//
// This hook does NOT decide what happens when the last tab is resolved —
// `resolveAndAdvance` returns the completed bundle instead of calling
// anything, and the flow (useImportFlowState) chooses between handing off to
// resolve-lists and committing. Keeping that decision out of here is what
// lets the flow own both sub-hooks without either depending on the other.

import { useCallback, useMemo, useState } from 'react'
import type {
  ImportCheckResponse,
  ImportRatingConflict,
  ImportRowConflict,
} from '@/lib/api/import'
import type { GroupResolution } from './FieldConflictMerge'
import {
  CONFLICT_SUB_STEP_ORDER,
  firstConflictSubStep,
  type ConflictSubStep,
  type RowResolutions,
} from './importWizardModel'

export function useConflictResolution() {
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

  // Store what the check returned. Always called, even on the blanket-override
  // path that never shows a resolver — the conflicts stay available for the
  // rest of the flow.
  const store = useCallback((result: ImportCheckResponse) => {
    setCompletionConflicts(result.completionConflicts)
    setProgressConflicts(result.progressConflicts)
    setDroppedConflicts(result.droppedConflicts)
    setRatingConflicts(result.ratingConflicts)
  }, [])

  // Enter the sub-step sequence at its first non-empty tab, clearing any
  // resolutions from a previous run. Returns null when there is nothing to
  // resolve, in which case the caller skips resolve-conflicts entirely.
  const begin = useCallback((result: ImportCheckResponse) => {
    const first = firstConflictSubStep(
      result.completionConflicts,
      result.progressConflicts,
      result.droppedConflicts,
      result.ratingConflicts
    )
    if (!first) return null
    setConflictSubStep(first)
    setCompletionResolutions(new Map())
    setProgressResolutions(new Map())
    setDroppedResolutions(new Map())
    setRatingResolutions(new Map())
    return first
  }, [])

  // Next non-empty sub-step after `from`, or null when it was the last one
  // with anything in it.
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

  // Store one tab's resolutions and move to the next non-empty tab. Returns
  // the complete four-tab bundle when there was no next tab (the sequence is
  // done), otherwise null.
  //
  // The bundle reads its sibling tabs from state rather than accumulating a
  // parameter: by the time the LAST sub-step's handler fires, every earlier
  // sub-step has already gone through its own setState + re-render, so those
  // values are current.
  const resolveAndAdvance = useCallback(
    (
      tab: ConflictSubStep,
      resolved: Map<string, GroupResolution>
    ): RowResolutions | null => {
      const bundle: RowResolutions = {
        completion: tab === 'completions' ? resolved : completionResolutions,
        progress: tab === 'progress' ? resolved : progressResolutions,
        dropped: tab === 'dropped' ? resolved : droppedResolutions,
        rating: tab === 'ratings' ? resolved : ratingResolutions,
      }

      if (tab === 'completions') setCompletionResolutions(resolved)
      else if (tab === 'progress') setProgressResolutions(resolved)
      else if (tab === 'dropped') setDroppedResolutions(resolved)
      else setRatingResolutions(resolved)

      const next = nextConflictSubStep(tab)
      if (next) {
        setConflictSubStep(next)
        return null
      }
      return bundle
    },
    [
      nextConflictSubStep,
      completionResolutions,
      progressResolutions,
      droppedResolutions,
      ratingResolutions,
    ]
  )

  // Drop every conflict the check found — used when the user cancels out of
  // resolution back to review.
  const reset = useCallback(() => {
    setCompletionConflicts([])
    setProgressConflicts([])
    setDroppedConflicts([])
    setRatingConflicts([])
  }, [])

  // Memoized so the identity only changes when the state inside it does —
  // the flow's callbacks take this object as a dependency, and a fresh object
  // every render would make their useCallbacks meaningless.
  return useMemo(
    () => ({
      conflictSubStep,
      completionConflicts,
      progressConflicts,
      droppedConflicts,
      ratingConflicts,
      // The bundle as it currently stands — read by the list-merge hand-off,
      // which commits after resolve-conflicts has already finished.
      resolutions: {
        completion: completionResolutions,
        progress: progressResolutions,
        dropped: droppedResolutions,
        rating: ratingResolutions,
      } satisfies RowResolutions,
      store,
      begin,
      resolveAndAdvance,
      reset,
    }),
    [
      conflictSubStep,
      completionConflicts,
      progressConflicts,
      droppedConflicts,
      ratingConflicts,
      completionResolutions,
      progressResolutions,
      droppedResolutions,
      ratingResolutions,
      store,
      begin,
      resolveAndAdvance,
      reset,
    ]
  )
}
