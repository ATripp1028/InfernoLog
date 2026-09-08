// The Ranking page's one write: a rating edit made inline on a row.
//
// There is no ranking endpoint. A rating lives on `LevelProgress`, so this
// patches the same `PATCH /v1/me/progress/:levelId` the level page's edit modal
// uses — the server recomputes the order and records the `rating_rank` move
// itself.
//
// The cached rating is rewritten on SUCCESS, not on mutate. A rating edit is a
// deliberate act with a form behind it, and the row moving out from under an
// open editor — before the server has agreed — makes a save that then fails
// look like one that worked. Writing the cache the moment the response lands
// still moves the row immediately from the user's point of view, without
// claiming anything the server has not confirmed.

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

/** A rating edit: one score per category, on the internal 0–100 scale. */
export interface RatingEdit {
  levelId: string
  ratingScores?: { categoryId: string; score: number }[]
}

/**
 * Saves a rating edit, then moves the row.
 *
 * The `overallRating` written on success is computed with the **same**
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

    onSuccess: (_data, edit) => {
      // Stop an in-flight refetch from landing on top of this write.
      void queryClient.cancelQueries({ queryKey: logQueryKey })
      queryClient.setQueryData<LevelProgressListItem[]>(logQueryKey, (rows) =>
        rows?.map((row) =>
          row.level.inGameId === edit.levelId
            ? applyEdit(row, edit, config)
            : row
        )
      )
      // The server owns the real figure — its rounding, and any field the patch
      // touched indirectly. This reconciles the locally computed one.
      invalidate()
    },
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
  const ratingScores = edit.ratingScores ?? row.ratingScores

  return {
    ...row,
    ratingScores,
    overallRating: computeOverallRating(config, {
      enjoyment: row.entry?.enjoyment ?? null,
      ratingScores,
    }),
  }
}
