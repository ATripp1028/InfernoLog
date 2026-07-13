import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { ApiError, apiFetch } from './client'

export { ApiError }

export type RatingMode = 'SIMPLE' | 'WEIGHTED'
export type RatingDisplayScale = 'ZERO_TO_TEN' | 'ZERO_TO_HUNDRED'
export type DateFormatPreference = 'MDY' | 'DMY' | 'YMD' | 'ISO'
export type GdVersion = 'TWO_ONE' | 'TWO_TWO'

export interface RatingCategory {
  id: string
  name: string
  weight: number
  sortOrder: number
}

export interface MeData {
  id: string
  username: string
  usernameChangedAt: string | null
  email: string
  discordId: string | null
  profilePublic: boolean
  discordPublic: boolean
  ratingMode: RatingMode
  ratingDisplayScale: RatingDisplayScale
  defaultFps: number
  defaultPercentageVersion: GdVersion
  dateFormatPreference: DateFormatPreference
  showHighlightUrl: boolean
  includeEnjoyment: boolean
  enjoymentWeight: number
  enjoymentSortOrder: number
  // True when a GDDL API key is stored. The key itself is never sent to the
  // client — it lives encrypted (KMS) server-side.
  hasGddlApiKey: boolean
  // Public GDDL account name confirmed at connection time; null when not
  // connected.
  gddlUsername: string | null
  ratingCategories: RatingCategory[]
  onboardingCompleted: boolean
  legalAcceptedAt: string | null
  isVerified: boolean
  createdAt: string
}

export const meQueryKey = ['me'] as const

export function useMe() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: meQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<MeData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: MeData }>('/v1/me', {
        token,
        method: 'GET',
      })
      return data
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function useConnectDiscord() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (): Promise<{ url: string }> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: { url: string } }>(
        '/v1/me/connect-discord',
        { token, method: 'POST' }
      )
      return data
    },
  })
}

export function useDisconnectDiscord() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const token = await getIdToken()
      await apiFetch('/v1/me/connect-discord', { token, method: 'DELETE' })
    },
    onSuccess: () => {
      queryClient.setQueryData<MeData>(meQueryKey, (old) =>
        old ? { ...old, discordId: null } : old
      )
    },
  })
}

// ─────────────────────────────────────────────
// GDDL API key — set/remove. The key is write-only from the client's
// perspective: we send it up to be encrypted server-side and only ever read
// back the `hasGddlApiKey` flag.
// ─────────────────────────────────────────────

export interface SetGddlApiKeyResult {
  me: MeData
  // GDDL account name confirmed during verification — shown in the success
  // message, not persisted.
  gddlName: string
}

export function useSetGddlApiKey() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (apiKey: string): Promise<SetGddlApiKeyResult> => {
      const token = await getIdToken()
      const { data, gddlName } = await apiFetch<{
        data: MeData
        gddlName: string
      }>('/v1/me/gddl-key', {
        token,
        method: 'PUT',
        body: { apiKey },
      })
      return { me: data, gddlName }
    },
    onSuccess: ({ me }) => {
      queryClient.setQueryData(meQueryKey, me)
    },
  })
}

export function useRemoveGddlApiKey() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<MeData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: MeData }>('/v1/me/gddl-key', {
        token,
        method: 'DELETE',
      })
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, data)
    },
  })
}

// ─────────────────────────────────────────────
// GDDL sync
// ─────────────────────────────────────────────

export interface GddlSyncResult {
  created: number
  enriched: number
  skipped: number
  errors: { levelId: string; reason: string }[]
}

export interface GddlSyncJobStatus {
  status: 'pending' | 'completed' | 'failed'
  result: GddlSyncResult | null
  error: string | null
}

// Starts an async sync job. Returns the jobId immediately (202); the caller
// should poll useGddlSyncStatus until status is not "pending".
export function useGddlSync() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (): Promise<{ jobId: string }> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: { jobId: string } }>(
        '/v1/me/gddl-sync',
        { token, method: 'POST' }
      )
      return data
    },
  })
}

// Polls for the status of a sync job. Pass null to disable.
// Stops refetching automatically once status is no longer "pending".
export function useGddlSyncStatus(jobId: string | null) {
  const { getIdToken } = useAuth()
  return useQuery({
    queryKey: ['gddl-sync', jobId],
    enabled: jobId !== null,
    queryFn: async (): Promise<GddlSyncJobStatus> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: GddlSyncJobStatus }>(
        `/v1/me/gddl-sync/${jobId}`,
        { token, method: 'GET' }
      )
      return data
    },
    refetchInterval: (query) => {
      return query.state.data?.status === 'pending' ? 2000 : false
    },
    retry: false,
  })
}

// ─────────────────────────────────────────────
// GDDL lists sync (favorites / least favorites)
// ─────────────────────────────────────────────

export interface GddlListSyncSummary {
  addedToInferno: string[]
  addedToGddl: string[]
  removedFromGddl: string[]
  skipped: string[]
}

export interface GddlListSyncResult {
  favorites: GddlListSyncSummary
  leastFavorites: GddlListSyncSummary
}

// Synchronously syncs InfernoLog FAVORITES/LEAST_FAVORITES with the
// corresponding GDDL user lists. Returns the diff summary.
export function useGddlListsSync() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<GddlListSyncResult> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: GddlListSyncResult }>(
        '/v1/me/gddl-lists-sync',
        { token, method: 'POST' }
      )
      return data
    },
    onSuccess: () => {
      // Invalidate all collection queries so the updated lists are re-fetched.
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
  })
}

// ─────────────────────────────────────────────
// Settings mutations
// ─────────────────────────────────────────────

export interface UpdateMeInput {
  profilePublic?: boolean
  discordPublic?: boolean
  defaultFps?: number
  defaultPercentageVersion?: GdVersion
  dateFormatPreference?: DateFormatPreference
  showHighlightUrl?: boolean
  ratingMode?: RatingMode
  ratingDisplayScale?: RatingDisplayScale
  includeEnjoyment?: boolean
  enjoymentWeight?: number
  acceptLegal?: true
  onboardingCompleted?: boolean
}

// Rapid-fire mutations (toggles, selects, drag reorders) need three things to
// avoid UI flicker AND server-side races when the user clicks quickly:
//
//   1. `scope: { id }` — TanStack Query serializes mutations sharing a scope,
//      so PATCH requests fire one at a time. Without this, two PATCH bodies
//      arrive at the API concurrently and can interleave at the DB; the row
//      can end up in the older click's state regardless of network ordering.
//
//   2. No cache writes in `onSuccess`. The optimistic update applied in
//      `onMutate` already reflects the user's latest intent. Writing the
//      response body back here is incorrect when responses land out of order
//      — an older response would overwrite a newer click's optimistic state.
//
//   3. `onSettled` invalidates `meQueryKey` only when the last queued mutation
//      with the same key has settled. This refetches authoritative server
//      state — important for fields the server derives (e.g. ratingCategories
//      seeded on first WEIGHTED switch) — without thrashing during the queue.
const UPDATE_ME_KEY = ['updateMe'] as const
const UPDATE_USERNAME_KEY = ['updateUsername'] as const
const UPDATE_RATING_CONFIG_KEY = ['updateRatingConfig'] as const

// Every settings-page save mutation shares one of these keys; the
// `useSettingsSaveNotifier` hook (apps/web/src/features/settings/hooks)
// listens for them as a group so one "Saved" toast fires per burst.
export const SETTINGS_SAVE_MUTATION_KEYS: ReadonlyArray<readonly string[]> = [
  UPDATE_ME_KEY,
  UPDATE_USERNAME_KEY,
  UPDATE_RATING_CONFIG_KEY,
]

function isLastPending(
  queryClient: ReturnType<typeof useQueryClient>,
  mutationKey: readonly unknown[]
): boolean {
  // The current mutation is still counted while its callbacks run, so 1 means
  // there's nothing queued behind us.
  return queryClient.isMutating({ mutationKey: mutationKey as unknown[] }) === 1
}

export function useUpdateMe() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: UPDATE_ME_KEY,
    scope: { id: 'updateMe' },
    mutationFn: async (input: UpdateMeInput): Promise<MeData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: MeData }>('/v1/me', {
        token,
        method: 'PATCH',
        body: input,
      })
      return data
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: meQueryKey })
      const previous = queryClient.getQueryData<MeData>(meQueryKey)
      queryClient.setQueryData<MeData>(meQueryKey, (old) =>
        old ? { ...old, ...input } : old
      )
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(meQueryKey, ctx.previous)
    },
    onSettled: () => {
      // Refetch authoritative state only once the queue has drained.
      if (isLastPending(queryClient, UPDATE_ME_KEY)) {
        return queryClient.invalidateQueries({ queryKey: meQueryKey })
      }
      return undefined
    },
  })
}

export interface UsernameCooldownError {
  status: 403
  nextAllowedAt: string
}

export function useUpdateUsername() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: UPDATE_USERNAME_KEY,
    mutationFn: async (username: string): Promise<MeData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: MeData }>('/v1/me/username', {
        token,
        method: 'PATCH',
        body: { username },
      })
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, data)
    },
  })
}

// ─────────────────────────────────────────────
// Rating config — bulk update (categories + enjoyment together)
// ─────────────────────────────────────────────

// Active weights (categories plus enjoymentWeight when enabled) must sum to
// exactly 1.00, validated with integer-cents math (no float tolerance).
// Keep in sync with @infernolog/core's RatingConfigSchema.
export const RATING_WEIGHT_SUM_TARGET_CENTS = 100

export interface RatingConfigInput {
  categories: Array<{
    id?: string
    name: string
    weight: number
  }>
  includeEnjoyment: boolean
  enjoymentWeight: number
  enjoymentSortOrder: number
}

export function useUpdateRatingConfig() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: UPDATE_RATING_CONFIG_KEY,
    mutationFn: async (input: RatingConfigInput): Promise<MeData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: MeData }>(
        '/v1/me/rating-config',
        { token, method: 'PUT', body: input }
      )
      return data
    },
    onSuccess: (data) => {
      // The endpoint returns the full updated user; the editor is form-style
      // (single save click, no rapid-fire races) so we can safely write the
      // response straight to the cache without the scope/isLastPending dance.
      queryClient.setQueryData(meQueryKey, data)
    },
  })
}

// ─────────────────────────────────────────────
// Account deletion
// ─────────────────────────────────────────────

export const DELETE_ACCOUNT_CONFIRMATION = 'Delete this account'

export function useDeleteAccount() {
  const { getIdToken } = useAuth()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const token = await getIdToken()
      await apiFetch('/v1/me', {
        token,
        method: 'DELETE',
        body: { confirmation: DELETE_ACCOUNT_CONFIRMATION },
      })
    },
  })
}

// Username availability check (debounced calls in the editor)
export async function checkUsernameAvailable(
  username: string,
  signal: AbortSignal
): Promise<{ available: boolean; error?: string }> {
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/v1/users/check-username?username=${encodeURIComponent(username)}`,
    { signal }
  )
  return (await res.json()) as { available: boolean; error?: string }
}
