// The two surfaces that read the activity log: the Log page's merged feed and
// the level page's rank history.
//
// This module also owns INVALIDATE_ON_EVENT, which is deliberately a SECOND set
// rather than extra entries in logging.ts's INVALIDATE_ON_WRITE. That set means
// "affected by a completion/progress/drop write"; the event surfaces are
// affected by a superset — ranking moves and rating-config saves emit events
// too, and a config save invalidates the `me` query alone today. Widening the
// older set would make a config save needlessly refetch the List and
// collections. See docs/EVENT_LOG.md, "Keeping the surfaces fresh".

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type {
  ActivityFeedItem,
  ActivityFeedKind,
  ActivityFieldCategory,
  RankHistoryEntry,
} from '@infernolog/core'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'

/** The Log page's feed. Prefix key: one entry per filter combination. */
export const activityQueryKey = ['activity'] as const

/**
 * One level's rank history. Prefix match on `['rank-history']` invalidates
 * every level's, without the caller needing to know which one is open.
 */
export const rankHistoryQueryKey = (levelId: string) =>
  ['rank-history', levelId] as const

/**
 * Every view that reads the activity log, and is therefore stale after ANY
 * write that emits an event.
 *
 * Exported for the same reason `INVALIDATE_ON_WRITE` is: the paths that emit
 * events are spread across progress writes, ranking moves, the spreadsheet
 * import and the rating-config save, and each one invalidating its own
 * hand-written list is how the lists drift. Both entries are prefix keys.
 */
export const INVALIDATE_ON_EVENT: ReadonlyArray<readonly string[]> = [
  ['activity'],
  ['rank-history'],
]

/**
 * Refetches every activity-log surface after a write that emitted an event.
 *
 * Cancels before invalidating for the same reason {@link invalidateOnWrite}
 * does — a fetch already in flight was issued before this write, so
 * `invalidateQueries` would adopt its pre-write response and stamp it fresh.
 *
 * `allSettled` so one failed refetch cannot surface as a failed write.
 */
export async function invalidateOnEvent(queryClient: QueryClient) {
  await Promise.allSettled(
    INVALIDATE_ON_EVENT.map(async (key) => {
      await queryClient.cancelQueries({ queryKey: key as unknown[] })
      return queryClient.invalidateQueries({ queryKey: key as unknown[] })
    })
  )
}

/** {@link invalidateOnEvent} bound to the active query client. */
export function useInvalidateOnEvent() {
  const queryClient = useQueryClient()
  return () => invalidateOnEvent(queryClient)
}

/** The Log page's filter state, as the feed query consumes it. */
export interface ActivityFilters {
  /** The chips. Empty means "All" — the whole feed. */
  kinds: ActivityFeedKind[]
  /** Narrows the Edits chip only. Empty means every category. */
  categories: ActivityFieldCategory[]
  /** GD level id, or null for every level. */
  levelId: string | null
  /** Recorded-time bounds, as ISO strings. Never the user-entered date. */
  from: string | null
  to: string | null
}

function filterParams(filters: ActivityFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const kind of filters.kinds) params.append('kind', kind)
  for (const category of filters.categories) params.append('category', category)
  if (filters.levelId) params.set('levelId', filters.levelId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  return params
}

/** One keyset page of the feed. */
export interface FeedPage {
  data: ActivityFeedItem[]
  nextCursor: string | null
}

/**
 * The Log page's feed, one keyset page at a time.
 *
 * The cursor is opaque and encodes the feed's full three-part sort key, so a
 * page boundary landing inside a spreadsheet import's single-timestamp batch
 * neither skips nor repeats rows.
 *
 * @param filters - Part of the query key, so changing a chip starts a fresh
 * paginated query rather than appending to the previous filter's pages.
 */
export function useActivityFeed(filters: ActivityFilters) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useInfiniteQuery({
    queryKey: [...activityQueryKey, filters],
    enabled: isAuthenticated,
    initialPageParam: null as string | null,
    getNextPageParam: (last: FeedPage) => last.nextCursor,
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      const token = await getIdToken()
      const params = filterParams(filters)
      if (pageParam) params.set('cursor', pageParam)
      const query = params.toString()
      return apiFetch<FeedPage>(`/v1/me/activity${query ? `?${query}` : ''}`, {
        token,
        method: 'GET',
      })
    },
  })
}

/** One level's rank history, plus its live position in the classic ranking. */
export interface RankHistory {
  data: RankHistoryEntry[]
  currentPosition: number | null
}

/**
 * One level's rank history.
 *
 * The user's own level page only — there is no cross-user equivalent, and the
 * Global Level Page must not call this.
 *
 * @param enabled - False on a level the user has no entry for, so the panel
 * does not fire a request for a history that cannot exist.
 */
export function useRankHistory(levelId: string, enabled = true) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: rankHistoryQueryKey(levelId),
    enabled: isAuthenticated && enabled,
    queryFn: async (): Promise<RankHistory> => {
      const token = await getIdToken()
      return apiFetch<RankHistory>(
        `/v1/me/levels/${encodeURIComponent(levelId)}/rank-history`,
        { token, method: 'GET' }
      )
    },
  })
}
