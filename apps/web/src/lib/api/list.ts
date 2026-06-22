import { useQuery } from '@tanstack/react-query'
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
