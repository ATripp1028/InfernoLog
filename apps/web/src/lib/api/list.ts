import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LevelProgressListItem } from '@infernolog/core'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from './client'
import { INVALIDATE_ON_WRITE } from './logging'

export type { LevelProgressListItem }

// The List. Key matches the ['list'] entry in logging.ts's
// INVALIDATE_ON_WRITE so completion/progress/drop writes refetch this view.
export const listQueryKey = ['list'] as const

export function useMyProgress() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: listQueryKey,
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

// Delete a level entry entirely (cascades server-side). Optimistically removes
// the row, then refetches the list to reconcile.
export function useDeleteProgress() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (levelId: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/progress/${levelId}`, { token, method: 'DELETE' })
    },
    onMutate: async (levelId) => {
      await queryClient.cancelQueries({ queryKey: listQueryKey })
      const previous =
        queryClient.getQueryData<LevelProgressListItem[]>(listQueryKey)
      queryClient.setQueryData<LevelProgressListItem[]>(listQueryKey, (old) =>
        old ? old.filter((i) => i.level.inGameId !== levelId) : old
      )
      return { previous }
    },
    onError: (_err, _levelId, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listQueryKey, ctx.previous)
    },
    // Deleting a level's entire progress can remove a Ranking entry and/or
    // affect Collections (e.g. Want to Beat), and if the level's own page is
    // open it needs to know the entry is gone — not just the List. Awaited
    // (allSettled) so callers relying on mutateAsync/isPending stay pending
    // until the refetch actually lands, rather than seeing stale data with no
    // indication a refetch is in flight.
    onSettled: async () => {
      await Promise.allSettled(
        INVALIDATE_ON_WRITE.map((key) =>
          queryClient.invalidateQueries({ queryKey: key as unknown[] })
        )
      )
    },
  })
}
