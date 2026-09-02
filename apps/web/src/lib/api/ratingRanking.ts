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
