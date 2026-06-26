import { useQuery } from '@tanstack/react-query'
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
