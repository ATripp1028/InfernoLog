// The Ranking page's one write: a rating edit made inline on a row.
//
// There is no ranking endpoint. A rating lives on `LevelProgress`, so this
// patches the same `PATCH /v1/me/progress/:levelId` the level page's edit modal
// uses — the server recomputes the order and records the `rating_rank` move
// itself. What is special here is the optimism: the row has to slide to its new
// position the moment the user saves, so the cached rating is updated locally
// first and the list re-sorts off that.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  computeOverallRating,
  type LevelProgressListItem,
  type OverallRatingConfig,
} from '@infernolog/core'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'
import { logQueryKey } from './log'
import { useInvalidateOnWrite } from './logging'

/** A rating edit: whichever of the two forms the user's mode calls for. */
export interface RatingEdit {
  levelId: string
  /** SIMPLE mode. Internal 0–100. */
  simpleRating?: number | null
  /** WEIGHTED mode. Internal 0–100 per category. */
  ratingScores?: { categoryId: string; score: number }[]
}

/**
 * Saves a rating edit and moves the row immediately.
 *
 * The optimistic `overallRating` is computed with the **same**
 * `computeOverallRating` the server serializes with, from the same config — so
 * the position the row slides to is the position the refetch confirms, rather
 * than a guess that visibly corrects itself a moment later.
 *
 * @param config - The user's rating configuration, from `useMe`.
 */
export function useEditRating(config: OverallRatingConfig) {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateOnWrite()

  return useMutation({
    mutationFn: async ({ levelId, ...payload }: RatingEdit): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/progress/${encodeURIComponent(levelId)}`, {
        token,
        method: 'PATCH',
        body: payload,
      })
    },

    onMutate: async (edit) => {
      // Stop an in-flight refetch from landing on top of the optimistic write.
      await queryClient.cancelQueries({ queryKey: logQueryKey })
      const previous =
        queryClient.getQueryData<LevelProgressListItem[]>(logQueryKey)

      queryClient.setQueryData<LevelProgressListItem[]>(logQueryKey, (rows) =>
        rows?.map((row) =>
          row.level.inGameId === edit.levelId ? applyEdit(row, edit, config) : row
        )
      )
      return { previous }
    },

    onError: (_err, _edit, context) => {
      if (context?.previous) {
        queryClient.setQueryData(logQueryKey, context.previous)
      }
    },

    // The server owns the real figure — its rounding, and any field the patch
    // touched indirectly. Reconciles the optimistic guess either way.
    onSettled: invalidate,
  })
}

/**
 * The optimistic row: the edit folded in, with `overallRating` recomputed the
 * way the server will compute it.
 *
 * Exported for its own tests — it is what decides where the row slides to, and
 * a wrong answer here shows up as a row that visibly corrects itself after the
 * refetch rather than as a failure.
 */
export function applyEdit(
  row: LevelProgressListItem,
  edit: RatingEdit,
  config: OverallRatingConfig
): LevelProgressListItem {
  const simpleRating =
    edit.simpleRating !== undefined ? edit.simpleRating : rowSimpleRating(row)
  const ratingScores = edit.ratingScores ?? row.ratingScores

  return {
    ...row,
    ratingScores,
    overallRating: computeOverallRating(config, {
      simpleRating,
      enjoyment: row.entry?.enjoyment ?? null,
      ratingScores,
    }),
  }
}

// A list row carries the computed `overallRating` but not the raw
// `simpleRating` behind it. In SIMPLE mode the two are the same number by
// definition (`computeOverallRating` returns `simpleRating` unchanged), and in
// WEIGHTED mode the value is ignored entirely — so reading it back off the row
// is sound in both, and only ever actually used in the first.
function rowSimpleRating(row: LevelProgressListItem): number | null {
  return row.overallRating
}
