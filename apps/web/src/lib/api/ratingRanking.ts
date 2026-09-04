// The MANUAL rating mode's ordering, from `/v1/me/ranking`.
//
// That endpoint answers for every rating mode, but this client is only used in
// MANUAL. In SIMPLE and WEIGHTED the Ranking page derives the same order on the
// client from the `['log']` query it already has — no round trip, and no second
// definition of the order, since both sides run core's `ratingOrderComparator`.
// MANUAL is the one mode where the order is stored rather than derived, so it
// is the one mode that has to be fetched.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  PlaceRatingInput,
  RatingRankingResponse,
  ReorderRatingInput,
} from '@infernolog/core'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'
import { useInvalidateOnWrite } from './logging'

export type { RatingRankingResponse }

/** The stored MANUAL ordering. */
export const ratingRankingQueryKey = ['rating-ranking'] as const

/**
 * The mutation key every rating-ranking write is registered under.
 *
 * `useOrderingBoard` reads in-flight state from it (`useMutationState`) to
 * freeze its resync effect while a drag is being persisted, so the three
 * mutations below MUST declare it — the demon list's writes do the same under
 * `['rankingReorder']`. Its own key, so an in-flight demon list move cannot
 * freeze this board and vice versa.
 */
export const ratingReorderMutationKey = ['ratingReorder'] as const

/**
 * The user's ranking as the server sees it.
 *
 * @param enabled - Pass false outside MANUAL mode; the other modes derive their
 * order client-side and this query would be a wasted round trip.
 */
export function useRatingRanking(enabled: boolean) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: ratingRankingQueryKey,
    enabled: isAuthenticated && enabled,
    queryFn: async (): Promise<RatingRankingResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: RatingRankingResponse }>(
        '/v1/me/ranking',
        { token, method: 'GET' }
      )
      return data
    },
  })
}

type PlaceVars = PlaceRatingInput
type ReorderVars = ReorderRatingInput & { levelProgressId: string }

/**
 * Places an unranked completion into the ordering.
 *
 * Every write returns the whole freshly serialized ranking, so the cache is
 * written from the response rather than guessed at — the server owns the
 * fractional indices and may have renormalised the entire list on the way.
 */
export function usePlaceRating() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    // Shared by all three writes, and the key useOrderingBoard watches to know
    // a move is in flight — without it the board's resync effect fires straight
    // away and snaps the dragged row back to its pre-drag position.
    mutationKey: ratingReorderMutationKey,
    mutationFn: async (vars: PlaceVars): Promise<RatingRankingResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: RatingRankingResponse }>(
        '/v1/me/ranking',
        { token, method: 'POST', body: vars }
      )
      return data
    },
    onSuccess: (data) => {
      qc.setQueryData(ratingRankingQueryKey, data)
      invalidate()
    },
  })
}

/** Moves a ranked entry between new neighbours. */
export function useReorderRating() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationKey: ratingReorderMutationKey,
    mutationFn: async ({
      levelProgressId,
      ...body
    }: ReorderVars): Promise<RatingRankingResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: RatingRankingResponse }>(
        `/v1/me/ranking/${encodeURIComponent(levelProgressId)}`,
        { token, method: 'PATCH', body }
      )
      return data
    },
    onSuccess: (data) => {
      qc.setQueryData(ratingRankingQueryKey, data)
      invalidate()
    },
  })
}

/** Takes an entry out of the ordering; the completion itself is untouched. */
export function useRemoveRating() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationKey: ratingReorderMutationKey,
    mutationFn: async (
      levelProgressId: string
    ): Promise<RatingRankingResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: RatingRankingResponse }>(
        `/v1/me/ranking/${encodeURIComponent(levelProgressId)}`,
        { token, method: 'DELETE' }
      )
      return data
    },
    onSuccess: (data) => {
      qc.setQueryData(ratingRankingQueryKey, data)
      invalidate()
    },
  })
}
