import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { LevelProgressListItem } from '@infernolog/core'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'
import { invalidateOnWrite } from './logging'

export type { LevelProgressListItem }

/**
 * The Log. Key matches the ['log'] entry in logging.ts's
 * INVALIDATE_ON_WRITE so completion/progress/drop writes refetch this view.
 */
export const logQueryKey = ['log'] as const

/**
 * Every level the user has logged — the Log page's single query.
 */
export function useMyProgress() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: logQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<LevelProgressListItem[]> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LevelProgressListItem[] }>(
        '/v1/me/progress',
        { token, method: 'GET' }
      )
      return data
    },
  })
}

/**
 * The Log's row for one level as it already sits in the cache, without ever
 * fetching one.
 *
 * `skipToken` subscribes to the Log query — including whatever the
 * localStorage persister restored at boot — but never issues a request, so a
 * page can read the row on its first render for free. `known` separates "the
 * Log isn't cached, so this says nothing" from "the Log is cached and holds
 * no row for this level"; only the latter is evidence the user hasn't logged
 * it. Callers must still defer to their own authoritative query once it
 * lands, since the cached row can be up to a day stale.
 */
export function useCachedLogRow(levelId: string): {
  known: boolean
  row: LevelProgressListItem | undefined
} {
  const { data } = useQuery<LevelProgressListItem[]>({
    queryKey: logQueryKey,
    queryFn: skipToken,
  })
  return {
    known: data !== undefined,
    row: data?.find((item) => item.level.inGameId === levelId),
  }
}

/**
 * Delete a level entry entirely (cascades server-side). Optimistically removes
 * the row, then refetches the list to reconcile.
 */
export function useDeleteProgress() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (levelId: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/progress/${encodeURIComponent(levelId)}`, {
        token,
        method: 'DELETE',
      })
    },
    onMutate: async (levelId) => {
      await queryClient.cancelQueries({ queryKey: logQueryKey })
      const previous =
        queryClient.getQueryData<LevelProgressListItem[]>(logQueryKey)
      queryClient.setQueryData<LevelProgressListItem[]>(logQueryKey, (old) =>
        old ? old.filter((i) => i.level.inGameId !== levelId) : old
      )
      return { previous }
    },
    onError: (_err, _levelId, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(logQueryKey, ctx.previous)
    },
    // Deleting a level's entire progress can remove a Ranking entry and/or
    // affect Collections (e.g. Want to Beat), and if the level's own page is
    // open it needs to know the entry is gone — not just the List. Awaited
    // (allSettled) so callers relying on mutateAsync/isPending stay pending
    // until the refetch actually lands, rather than seeing stale data with no
    // indication a refetch is in flight.
    onSettled: () => invalidateOnWrite(queryClient),
  })
}
