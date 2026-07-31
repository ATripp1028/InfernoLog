import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { ApiError, apiFetch } from './client'
import type { Level } from './logging'

export { ApiError }

// The Global Level Page wire shape: the full cached Level, plus two fields the
// logging flow omits as internal — delistedAt (drives the frozen-as-of banner)
// and lastCheckedAt (its date) — and hasUserProgress, an EXISTENCE check against
// the user's level_progress (no progress values are sent). Dates are ISO
// strings. Mirrors packages/core's GlobalLevelPageSchema (see logging.ts for why
// we hand-mirror rather than import the Zod type).
export interface GlobalLevelPageData extends Level {
  delistedAt: string | null
  lastCheckedAt: string | null
  hasUserProgress: boolean
}

// The distinguishable non-2xx outcomes the page branches on. Anything else
// (a 500, a network failure) is treated the same as an unreachable resolve.
export type LevelPageErrorKind = 'not_found' | 'unreachable' | 'unknown'

export function levelPageErrorKind(error: unknown): LevelPageErrorKind {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'not_found'
    if (error.status === 503) return 'unreachable'
  }
  return 'unknown'
}

// Fetches the Global Level Page for a level. A cache miss resolves the level
// from GD server-side (the /page endpoint does this); the two failure modes
// arrive as distinct HTTP statuses (404 not-found vs 503 unreachable) so the
// page can render different terminal/retryable states. retry:false so those
// statuses surface immediately as states rather than being retried away — the
// resolve-failed state offers a manual Retry (refetch) instead.
export function useGlobalLevelPage(levelId: string) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: ['global-level-page', levelId],
    enabled: isAuthenticated && !!levelId,
    retry: false,
    queryFn: async (): Promise<GlobalLevelPageData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: GlobalLevelPageData }>(
        `/v1/levels/${encodeURIComponent(levelId)}/page`,
        { token, method: 'GET' }
      )
      return data
    },
  })
}
