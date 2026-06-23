import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LevelProgressListItem } from '@infernolog/core'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from './client'

export type { LevelProgressListItem }

// The "My Demons" list. Key matches the ['list'] entry in logging.ts's
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listQueryKey })
    },
  })
}
