// Logging flow API client — the level-resolve reads and the
// completion/progress/drop writes, plus their cache invalidation.
//
// Wire types mirror packages/core's Zod schemas as plain TS rather than
// importing them: apps/web pins zod@3 while core is on zod@4, and the server
// is the source of truth for validation. The enums shared with other
// endpoints live in ./wireEnums. (Same convention as lib/api/me.ts.)

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { ApiError, apiFetch, retryAfterSeconds } from './client'
import { INVALIDATE_ON_EVENT } from './activity'
import {
  browseApiQueryString,
  type SearchPageState,
} from '../levelSearchParams'
import type {
  Device,
  DifficultyOpinion,
  EntryVisibility,
  GdVersion,
} from './wireEnums'

/**
 * A level as InfernoLog has it cached — RobTop's metadata plus the Song File
 * Hub NONG fields and the extended snapshot.
 *
 * `inGameId` is the primary key, not a UUID: reuploads share it. Almost
 * everything else is nullable, since a level can be seeded from a search
 * result long before a full resolve fills the rest in.
 */
export interface Level {
  inGameId: string
  levelType: 'CLASSIC' | 'PLATFORMER'
  isRated: boolean
  isDemon: boolean
  name: string | null
  creator: string | null
  inGameDifficulty: string | null
  length: string | null
  songName: string | null
  songAuthor: string | null
  isNong: boolean
  // Song File Hub NONG data (null unless isNong). sfhSongName is the raw
  // "Artist - Title" string; sfhCheckedAt is internal and not sent.
  sfhId: string | null
  sfhSongName: string | null
  sfhYoutubeUrl: string | null
  sfhYoutubeVideoId: string | null
  sfhDownloadUrl: string | null
  sfhFileType: string | null
  sfhDownloads: number | null
  // Extended RobTop level metadata snapshot (all nullable; see schema.prisma).
  description: string | null
  creatorPlayerId: string | null
  creatorAccountId: string | null
  stars: number | null
  starsRequested: number | null
  partialDiff: string | null
  downloads: number | null
  likes: number | null
  disliked: boolean | null
  objectCount: number | null
  coins: number | null
  coinsVerified: boolean | null
  featured: boolean | null
  featureScore: number | null
  epicValue: number | null
  twoPlayer: boolean | null
  lowDetailMode: boolean | null
  copiedFromId: string | null
  levelVersion: number | null
  gameVersion: string | null
  officialSongId: number | null
  songId: string | null
  songLink: string | null
  // Raw megabyte value (e.g. 9.56). Format at the display layer.
  songSize: number | null
  dataSource: string
  verified: boolean
}

/**
 * The trimmed level shape a search returns — enough to render a result row and nothing more.
 */
export interface LevelSearchResult {
  inGameId: string
  name: string | null
  creator: string | null
  songName: string | null
  inGameDifficulty: string | null
  stars: number | null
  featured: boolean | null
  epicValue: number | null
  isRated: boolean
}

/**
 * The user's existing completion for a level, returned by the resolve so the
 * logging flow can pre-fill an edit rather than start blank.
 *
 * The fields below the divider are `LevelProgress`-scoped — one current value
 * per level — while the ones above belong to the completion event itself.
 */
export interface ExistingCompletion {
  progressUpdateId: string
  date: string | null
  dateTimezone: string | null
  dateUncertain: boolean
  attempts: number | null
  difficultyOpinion: DifficultyOpinion | null
  enjoyment: number | null
  worstFail: number | null
  worstFailDate: string | null
  worstFailDateTimezone: string | null
  fps: number | null
  percentageVersion: GdVersion | null
  onStream: boolean
  videoUrl: string | null
  highlightUrl: string | null
  notes: string | null
  visibility: EntryVisibility
  device: Device | null
  // LevelProgress fields — one current value per level, not per event.
  simpleRating: number | null
  ratingScores: Array<{ categoryId: string; score: number }>
  coinsCollected: number | null
  completionTime: number | null
  userGddlTier: number | null
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string | null
}

/**
 * What resolving a level id yields.
 *
 * @remarks `level` is `null` and `fallbackToManual` true when RobTop has no
 * such level and the user should be offered the manual-entry step instead;
 * `existingCompletion` is non-null when they have already beaten it.
 */
export interface ResolveLevelResponse {
  level: Level | null
  fallbackToManual: boolean
  suggestedGddlTier: number | null
  existingCompletion: ExistingCompletion | null
}

/**
 * A level typed in by hand when RobTop can't be reached or has no such id. Stored unverified until a later sync confirms it.
 */
export interface ManualLevelInput {
  inGameId: string
  name: string
  creator: string
  difficulty: string
  /**
   * Awarded star count, for a rated non-demon. Separate from `difficulty`
   * because a face spans two counts (Hard is 4 or 5) — see starDifficulty.ts.
   */
  stars?: number | null
  isDemon?: boolean
  isRated?: boolean
  songName?: string | null
  songAuthor?: string | null
  length?: string | null
}

/**
 * The completion write payload. Everything but `levelId` is optional — the
 * flow lets a user log a bare completion and fill in detail later.
 *
 * Ratings and enjoyment are internal 0–100 integers, not display units.
 */
export interface CompletionInput {
  levelId: string
  date?: string | null
  dateTimezone?: string | null
  dateUncertain?: boolean
  attempts?: number | null
  worstFail?: number | null
  worstFailDate?: string | null
  worstFailDateTimezone?: string | null
  fps?: number | null
  percentageVersion?: GdVersion | null
  onStream?: boolean
  highlightUrl?: string | null
  notes?: string | null
  visibility?: EntryVisibility
  videoUrl?: string | null
  difficultyOpinion?: DifficultyOpinion | null
  enjoyment?: number | null
  simpleRating?: number | null
  ratingScores?: Array<{ categoryId: string; score: number }>
  userGddlTier?: number | null
  coinsCollected?: number | null
  completionTime?: number | null
  twoPlayerSolo?: boolean | null
  twoPlayerPartner?: string | null
  device?: Device | null
}

/**
 * A non-completion progress write, discriminated by `mode`.
 *
 * `from_zero` carries a single `percentage` reached from the start;
 * `from_run` carries the `runFrom`/`runTo` bounds of a partial run. The two
 * are mutually exclusive, which is why this is a union rather than three
 * optional fields.
 */
export type ProgressInput = { levelId: string } & (
  | { mode: 'from_zero'; percentage: number }
  | { mode: 'from_run'; runFrom: number; runTo: number }
) & {
    enjoyment?: number | null
    date?: string | null
    dateTimezone?: string | null
    dateUncertain?: boolean
    attempts?: number | null
    fps?: number | null
    percentageVersion?: GdVersion | null
    onStream?: boolean
    highlightUrl?: string | null
    notes?: string | null
    visibility?: EntryVisibility
    device?: Device | null
  }

/**
 * The drop write payload — setting a level aside, with an optional reason in `notes`.
 */
export interface DropInput {
  levelId: string
  date?: string | null
  dateTimezone?: string | null
  attempts?: number | null
  worstFail?: number | null
  worstFailDate?: string | null
  worstFailDateTimezone?: string | null
  notes?: string | null
  visibility?: EntryVisibility
}

/**
 * The write endpoints echo back the resulting records; the flow only needs to
 * know the call succeeded, so the result shape is intentionally loose.
 */
export interface LogResult {
  levelProgress: { id: string; status: string }
  progressUpdate: { id: string } | null
}

/**
 * Every view that can be affected by a completion/progress/drop write.
 * Exported so other flows that write the same underlying data (edit/delete
 * on the Level Page, bulk GDDL/spreadsheet import, GDDL auto-sync) can
 * invalidate the same set instead of duplicating — and drifting from — it.
 */
export const INVALIDATE_ON_WRITE: ReadonlyArray<readonly string[]> = [
  ['list'],
  ['ranking'],
  // A completion can auto-remove a level from Want to Beat.
  ['collections'],
  // Prefix match: invalidates ['level-page', levelId] for whichever level
  // was open, without needing to know its id here.
  ['level-page'],
]

// Level entry support

/**
 * Cached-only DB lookup by numeric level ID — used to preview already-seeded
 * levels as the user types a numeric ID. Does NOT call RobTop.
 */
export function useLevelById(levelId: string) {
  const { getIdToken } = useAuth()
  const enabled = /^\d{4,}$/.test(levelId.trim())
  return useQuery({
    queryKey: ['levels', 'byId', levelId.trim()],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Level | null> => {
      const token = await getIdToken()
      try {
        const { data } = await apiFetch<{ data: Level }>(
          `/v1/levels/${encodeURIComponent(levelId.trim())}`,
          { token, method: 'GET' }
        )
        return data
      } catch {
        return null
      }
    },
  })
}

/**
 * Fuzzy name search. Enabled only for text queries of length >= 2 — numeric
 * inputs are level IDs and resolve directly, never search.
 */
export function useLevelSearch(query: string) {
  const { getIdToken } = useAuth()
  const q = query.trim()
  const enabled = q.length >= 2 && !/^\d+$/.test(q)
  return useQuery({
    queryKey: ['levels', 'search', q],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<LevelSearchResult[]> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LevelSearchResult[] }>(
        `/v1/levels/search?q=${encodeURIComponent(q)}`,
        { token, method: 'GET' }
      )
      return data
    },
  })
}

/**
 * GD-server escalation response. Three outcomes the UI branches on — see the
 * gd-search endpoint. `unreachable` also covers a rejected request (mapped
 * below) so the hook always resolves to one of these rather than throwing for
 * the expected network-failure case.
 */
export type GdSearchResponse =
  | { status: 'ok'; rated: LevelSearchResult[]; unrated: LevelSearchResult[] }
  | { status: 'nothing_new'; totalFound: number }
  | { status: 'unreachable' }
  // The caller has spent their per-user GD-lookup budget (429). Kept separate
  // from `unreachable` because the copy differs entirely: GD is fine, the user
  // simply asked too often, and the wait is known.
  | { status: 'rate_limited'; retryAfterSeconds: number }

/**
 * Input to an escalation. The bare-string form (`q`) is the legacy call from the
 * toolbar/logging/collections cache-search surfaces; the /search page passes a
 * full state so its filters/sort are forwarded to GD where the schema permits.
 */
export type GdSearchInput = string | SearchPageState

/**
 * The opt-in escalation call. A mutation (not a query) because it fires only on
 * explicit confirmation and each call is independent — there is no "escalated
 * mode" to keep in sync. A 503 is the expected RobTop-unreachable branch and
 * resolves to { status: 'unreachable' } rather than rejecting; a 429 is the
 * per-user GD-lookup budget and resolves to { status: 'rate_limited' }. Other
 * failures reject (surfaced as the hook's error state).
 *
 * Neither is retried: a mutation doesn't retry by default, and a budget 429 in
 * particular must not be, since the retry would itself be another request.
 */
export function useGdSearch() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (input: GdSearchInput): Promise<GdSearchResponse> => {
      const token = await getIdToken()
      const qs =
        typeof input === 'string'
          ? `q=${encodeURIComponent(input)}`
          : browseApiQueryString(input)
      try {
        return await apiFetch<GdSearchResponse>(`/v1/levels/gd-search?${qs}`, {
          token,
          method: 'GET',
        })
      } catch (err) {
        if (err instanceof ApiError && err.status === 503) {
          return { status: 'unreachable' }
        }
        if (err instanceof ApiError && err.status === 429) {
          return {
            status: 'rate_limited',
            retryAfterSeconds: retryAfterSeconds(err),
          }
        }
        throw err
      }
    },
  })
}

/**
 * Resolves a level id against the cache, falling back to RobTop.
 *
 * Returns a {@link ResolveLevelResponse} rather than throwing when the level
 * does not exist — check `fallbackToManual`.
 */
export function useResolveLevel() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (levelId: string): Promise<ResolveLevelResponse> => {
      const token = await getIdToken()
      return apiFetch<ResolveLevelResponse>(
        `/v1/levels/${encodeURIComponent(levelId)}/resolve`,
        { token, method: 'GET' }
      )
    },
  })
}

/**
 * Creates a hand-entered level. See {@link ManualLevelInput}.
 */
export function useCreateManualLevel() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (input: ManualLevelInput): Promise<Level> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: Level }>('/v1/levels', {
        token,
        method: 'POST',
        body: input,
      })
      return data
    },
  })
}

// Logging writes

/**
 * Refetches every view a write can change, from anywhere holding a query
 * client — the hook below is the usual way in.
 *
 * The cancel pass is not optional. A fetch already in flight was issued
 * *before* this write, so its response cannot contain it; `invalidateQueries`
 * only starts a fresh one when the query already has data (query-core's
 * `fetch()` honours `cancelRefetch` only in that case — otherwise it adopts
 * the in-flight promise). So invalidating during a view's very first load
 * resolves with pre-write data, stamps it as freshly fetched, and clears the
 * invalidation: the view then shows state missing the write for a whole
 * `staleTime` with nothing left to refetch it. Cancelling first forces the
 * refetch to be a new request, issued after the write.
 *
 * allSettled so a single failed refetch can't surface as a false
 * "write failed" error.
 */
export async function invalidateOnWrite(queryClient: QueryClient) {
  // A progress write is also an event — it puts a row in the Log page's feed —
  // so the activity surfaces refetch alongside the rest. They stay a SEPARATE
  // constant because the reverse is not true: a ranking move or a rating-config
  // save emits an event without touching the list, ranking or collections. See
  // INVALIDATE_ON_EVENT in ./activity.
  await Promise.allSettled(
    [...INVALIDATE_ON_WRITE, ...INVALIDATE_ON_EVENT].map(async (key) => {
      await queryClient.cancelQueries({ queryKey: key as unknown[] })
      return queryClient.invalidateQueries({ queryKey: key as unknown[] })
    })
  )
}

/**
 * Awaited by every mutation's onSuccess below (react-query awaits whatever
 * onSuccess returns before resolving mutate/mutateAsync) — so callers stay in
 * their pending state until the affected views have actually refetched,
 * rather than closing/navigating while the UI still shows stale data with no
 * indication a refetch is even happening.
 */
export function useInvalidateOnWrite() {
  const queryClient = useQueryClient()
  return () => invalidateOnWrite(queryClient)
}

/**
 * Logs a completion, then invalidates every view a completion can change.
 */
export function useLogCompletion() {
  const { getIdToken } = useAuth()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationFn: async (input: CompletionInput): Promise<LogResult> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LogResult }>(
        '/v1/me/completions',
        { token, method: 'POST', body: input }
      )
      return data
    },
    onSuccess: invalidate,
  })
}

/**
 * Logs a progress session, then invalidates every view it can change.
 */
export function useLogProgress() {
  const { getIdToken } = useAuth()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationFn: async (input: ProgressInput): Promise<LogResult> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LogResult }>('/v1/me/progress', {
        token,
        method: 'POST',
        body: input,
      })
      return data
    },
    onSuccess: invalidate,
  })
}

/**
 * Logs a drop, then invalidates every view it can change.
 */
export function useLogDrop() {
  const { getIdToken } = useAuth()
  const invalidate = useInvalidateOnWrite()
  return useMutation({
    mutationFn: async (input: DropInput): Promise<LogResult> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: LogResult }>('/v1/me/drops', {
        token,
        method: 'POST',
        body: input,
      })
      return data
    },
    onSuccess: invalidate,
  })
}

/**
 * Submits the user's completion of a level to GDDL as a record.
 *
 * Requires a connected GDDL API key; the server holds the key, so nothing
 * about it passes through here.
 */
export function useSubmitGddlRecord() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (levelId: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/gddl-records/${encodeURIComponent(levelId)}`, {
        token,
        method: 'POST',
      })
    },
  })
}
