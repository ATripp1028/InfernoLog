import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'
import {
  browseApiQueryString,
  type LevelBrowseResponse,
  type SearchPageState,
} from '@/lib/levelSearchParams'

/**
 * The /search page's cursor-paginated cache search (GET /v1/levels/browse).
 * Infinite query keyed on the full search state; each page threads the previous
 * page's opaque keyset cursor. Disabled until the page has a committed query or
 * at least one active filter (an all-empty search would scan the whole cache).
 */
export function useLevelBrowse(state: SearchPageState, enabled: boolean) {
  const { getIdToken } = useAuth()
  return useInfiniteQuery({
    queryKey: ['levels', 'browse', state],
    enabled,
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: LevelBrowseResponse) =>
      last.nextCursor ?? undefined,
    queryFn: async ({ pageParam }): Promise<LevelBrowseResponse> => {
      const token = await getIdToken()
      const qs = browseApiQueryString(state, pageParam)
      return apiFetch<LevelBrowseResponse>(`/v1/levels/browse?${qs}`, {
        token,
        method: 'GET',
      })
    },
  })
}
