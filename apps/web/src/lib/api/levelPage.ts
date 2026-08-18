import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { ApiError, apiFetch } from './client'
import { useInvalidateOnWrite } from './logging'
import type { LevelPageData } from '@/features/level-page/types'

export { ApiError }

/**
 * One level's full detail page for the current user.
 *
 * Never retried: a 404 here means the user has no entry for the level, which
 * is a state the page renders rather than a failure.
 */
export function useLevelPage(levelId: string) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: ['level-page', levelId],
    enabled: isAuthenticated && !!levelId,
    queryFn: async (): Promise<LevelPageData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LevelPageData }>(
        `/v1/me/progress/${encodeURIComponent(levelId)}`,
        { token, method: 'GET' }
      )
      return data
    },
    retry: false,
  })
}

/**
 * Patches level-scoped fields (`LevelProgress`). Invalidates every write-affected view, since an edit can move a Ranking row or a Collection membership.
 */
export function useEditProgress(levelId: string) {
  const { getIdToken } = useAuth()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/progress/${encodeURIComponent(levelId)}`, {
        token,
        method: 'PATCH',
        body: payload,
      })
    },
    // Edits can change fields shown on the Ranking board (e.g. attempts) or
    // Collections (e.g. visibility), not just this level's own page/the List.
    onSuccess: invalidate,
  })
}

/**
 * Delete a single logged entry (completion/progress/drop). If it was the
 * last remaining entry for the level, the server deletes the whole level
 * entry instead — the response's `deletedLevelProgress` flag tells the
 * caller which happened, so it can navigate away rather than re-render an
 * entry that no longer exists.
 */
export function useDeleteProgressUpdate(levelId: string) {
  const { getIdToken } = useAuth()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationFn: async (
      progressUpdateId: string
    ): Promise<{ deletedLevelProgress: boolean }> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{
        data: { deletedLevelProgress: boolean }
      }>(
        `/v1/me/progress/${encodeURIComponent(levelId)}/updates/${encodeURIComponent(progressUpdateId)}`,
        {
          token,
          method: 'DELETE',
        }
      )
      return data
    },
    // Deleting a completion removes its Ranking entry; deleting the last
    // entry deletes the whole LevelProgress, which can affect Collections too.
    onSuccess: invalidate,
  })
}
