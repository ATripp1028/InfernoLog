import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { ApiError, apiFetch } from './client'
import { useInvalidateOnWrite } from './logging'
import type {
  Device,
  EntryVisibility,
  GdVersion,
  LevelType,
  ProgressStatus,
} from './wireEnums'

export { ApiError }

/**
 * Everything the level page renders: the level, the user's LevelProgress fields, and every logged update.
 */
export interface LevelPageData {
  levelProgressId: string
  status: ProgressStatus
  visibility: EntryVisibility
  levelNotes: string | null
  worstFail: number | null
  worstFailDate: string | null
  worstFailDateTimezone: string | null
  userGddlTier: number | null
  // One current value per level, not per event.
  simpleRating: number | null
  ratingScores: RatingScore[]
  coinsCollected: number | null
  completionTime: number | null
  createdAt: string
  updatedAt: string
  listIndex: number | null
  rankPosition: number | null
  completionVideoUrl: string | null
  completionHighlightUrl: string | null
  level: LevelMeta
  progressUpdates: ProgressUpdate[]
  runsGraph: RunsGraphEntry[]
}

/**
 * The level fields the page and its edit modals need. Narrower than the full `Level`.
 */
export interface LevelMeta {
  inGameId: string
  name: string | null
  creator: string | null
  levelType: LevelType
  inGameDifficulty: string | null
  isDemon: boolean
  isRated: boolean
  featured: boolean
  epicValue: number
  length: string | null
  songName: string | null
  songAuthor: string | null
  coins: number | null
  coinsVerified: boolean | null
  twoPlayer: boolean | null
  officialSongId: number | null
}

/**
 * One logged event — a progress session, a drop, or the completion.
 */
export interface ProgressUpdate {
  progressUpdateId: string
  kind: 'PROGRESS' | 'DROP' | 'COMPLETION'
  percentage: number | null
  runFrom: number | null
  runTo: number | null
  attempts: number | null
  date: string | null
  dateTimezone: string | null
  dateUncertain: boolean
  onStream: boolean
  fps: number | null
  percentageVersion: GdVersion | null
  enjoyment: number | null
  difficultyOpinion: string | null
  notes: string | null
  videoUrl: string | null
  highlightUrl: string | null
  loggedAt: string
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string | null
  device: Device | null
}

/**
 * One category score on a level, in the internal 0–100 scale.
 */
export interface RatingScore {
  categoryId: string
  score: number
}

/**
 * A single point on the runs graph: one logged attempt range.
 */
export interface RunsGraphEntry {
  progressUpdateId: string | null
  kind: 'from_zero' | 'from_run' | 'completion' | 'worst_fail'
  from: number
  to: number
  // ISO date string, or null when the underlying event has no recorded date.
  // Used to give synthetic (progressUpdateId: null) bars a stable identity —
  // see entryKey in RunsGraph.tsx.
  date: string | null
  droppedAfter: boolean
}

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
