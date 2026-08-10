// Logic for ReviewStep: the counts and flag groupings the review summary is
// built from — what will import, what will be skipped, and which warnings are
// merely "we'll resolve this level by name" versus a dropped field value.

import { useMemo } from 'react'
import type { ParseFlag, ParseResult } from './parseSpreadsheet'
import type { AllFlags } from './importWizardModel'

export function useReviewStep(parseResult: ParseResult, flags: AllFlags) {
  // Recomputed only when the parsed data or its flags actually change —
  // otherwise unrelated re-renders (e.g. toggling the override checkbox)
  // would re-run every filter/reduce pass over the full row set for no
  // reason.
  return useMemo(() => {
    const allFlags = [
      ...flags.completions,
      ...flags.progress,
      ...flags.dropped,
      ...flags.ranking,
      ...flags.lists,
      ...flags.ratings,
    ]
    const errorFlags = allFlags.filter((f) => f.severity === 'error')
    const errorFlagsByTab = {
      completions: flags.completions.filter((f) => f.severity === 'error'),
      progress: flags.progress.filter((f) => f.severity === 'error'),
      dropped: flags.dropped.filter((f) => f.severity === 'error'),
      ranking: flags.ranking.filter((f) => f.severity === 'error'),
      lists: flags.lists.filter((f) => f.severity === 'error'),
      ratings: flags.ratings.filter((f) => f.severity === 'error'),
    }
    // Two flavors of warning: a missing level_id we'll resolve by name (the
    // row is fine), and a bad field value we've dropped (the rest of the row
    // imports).
    const isNameOnly = (f: ParseFlag) => f.field === 'level_id'
    const nameOnlyByTab = {
      completions: flags.completions.filter(
        (f) => f.severity === 'warning' && isNameOnly(f)
      ),
      progress: flags.progress.filter(
        (f) => f.severity === 'warning' && isNameOnly(f)
      ),
      dropped: flags.dropped.filter(
        (f) => f.severity === 'warning' && isNameOnly(f)
      ),
      ranking: flags.ranking.filter(
        (f) => f.severity === 'warning' && isNameOnly(f)
      ),
      lists: flags.lists.filter(
        (f) => f.severity === 'warning' && isNameOnly(f)
      ),
      ratings: flags.ratings.filter(
        (f) => f.severity === 'warning' && isNameOnly(f)
      ),
    }
    const dataWarnByTab = {
      completions: flags.completions.filter(
        (f) => f.severity === 'warning' && !isNameOnly(f)
      ),
      progress: flags.progress.filter(
        (f) => f.severity === 'warning' && !isNameOnly(f)
      ),
      dropped: flags.dropped.filter(
        (f) => f.severity === 'warning' && !isNameOnly(f)
      ),
      ranking: flags.ranking.filter(
        (f) => f.severity === 'warning' && !isNameOnly(f)
      ),
      lists: flags.lists.filter(
        (f) => f.severity === 'warning' && !isNameOnly(f)
      ),
      ratings: flags.ratings.filter(
        (f) => f.severity === 'warning' && !isNameOnly(f)
      ),
    }
    const sumTab = (o: Record<string, ParseFlag[]>) =>
      Object.values(o).reduce((n, arr) => n + arr.length, 0)
    const totalNameOnly = sumTab(nameOnlyByTab)
    const totalDataWarn = sumTab(dataWarnByTab)

    const validCompletions = parseResult.completions.filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        (r.data.levelId || r.data.levelName)
    )
    const validProgress = parseResult.progress.filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        (r.data.levelId || r.data.levelName)
    )
    const validDropped = parseResult.dropped.filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        (r.data.levelId || r.data.levelName)
    )
    const totalRanked = parseResult.ranking.filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        (r.levelId || r.levelName)
    ).length
    const totalListed = parseResult.lists.filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        r.list &&
        (r.levelId || r.levelName)
    ).length
    const totalRated = parseResult.ratings.filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        (r.levelId || r.levelName) &&
        Object.keys(r.scores).length > 0
    ).length
    const totalValid =
      validCompletions.length + validProgress.length + validDropped.length
    const totalSkipped = errorFlags.length + flags.duplicates.length

    return {
      errorFlags,
      errorFlagsByTab,
      dataWarnByTab,
      nameOnlyByTab,
      totalNameOnly,
      totalDataWarn,
      validCompletions,
      validProgress,
      validDropped,
      totalRanked,
      totalListed,
      totalRated,
      totalValid,
      totalSkipped,
    }
  }, [parseResult, flags])
}
