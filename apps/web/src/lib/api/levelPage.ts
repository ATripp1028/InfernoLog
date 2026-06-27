import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { ApiError, apiFetch } from './client'
import type { LevelPageData } from '../../features/level-page/types'

export { ApiError }

export function useLevelPage(usernameOrId: string, levelId: string) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: ['level-page', usernameOrId, levelId],
    enabled: isAuthenticated && !!usernameOrId && !!levelId,
    queryFn: async (): Promise<LevelPageData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LevelPageData }>(
        `/v1/users/${usernameOrId}/progress/${levelId}`,
        { token, method: 'GET' }
      )
      return data
    },
    retry: false,
  })
}

export function useEditProgress(userId: string, levelId: string) {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/progress/${levelId}`, {
        token,
        method: 'PATCH',
        body: payload,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['level-page', userId, levelId],
      })
      void queryClient.invalidateQueries({ queryKey: ['list'] })
    },
  })
}
