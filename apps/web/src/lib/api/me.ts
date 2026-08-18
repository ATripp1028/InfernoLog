import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { ApiError, apiFetch } from './client'
import type {
  DateFormatPreference,
  Device,
  GdVersion,
  RatingDisplayScale,
  RatingMode,
} from './wireEnums'

export { ApiError }

/**
 * One of the user's weighted-rating categories. `weight` is a fraction of 1.00, not a percentage.
 */
export interface RatingCategory {
  id: string
  name: string
  weight: number
  sortOrder: number
}

/**
 * The signed-in user's account, settings, and rating configuration.
 *
 * This is the app's single source for every display preference — rating
 * scale, date format, default FPS/device — so most surfaces read it rather
 * than threading preferences down as props.
 */
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
  defaultDevice: Device
  dateFormatPreference: DateFormatPreference
  showHighlightUrl: boolean
  autoExpandFabLabels: boolean
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

/**
 * Cache key for the signed-in user. `AuthContext` hydrates it on mount.
 */
export const meQueryKey = ['me'] as const

/**
 * The signed-in user. Never retried and never refetched on focus: a 404 here
 * means "no InfernoLog account for this Cognito identity", which the auth
 * flow handles as a state rather than an error worth retrying.
 */
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

/**
 * Links a Discord account to the profile.
 */
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

/**
 * Finishes a Discord link by exchanging the code returned from the OAuth flow.
 *
 * This call — not the redirect that precedes it — is what authorizes the link.
 * The API refuses unless the signed `state` names the account whose token is on
 * this request, which is what stops someone handing their own authorize URL to
 * a stranger and collecting the stranger's Discord identity onto their own
 * profile. See apps/api/src/routes/auth/discord.ts.
 *
 * Writes the resulting `discordId` straight into the cached user, so the
 * settings page is correct the moment it renders.
 */
export function useCompleteDiscordLink() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      code: string
      state: string
    }): Promise<{ discordId: string }> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: { discordId: string } }>(
        '/v1/me/connect-discord/complete',
        { token, method: 'POST', body: input }
      )
      return data
    },
    onSuccess: ({ discordId }) => {
      queryClient.setQueryData<MeData>(meQueryKey, (old) =>
        old ? { ...old, discordId } : old
      )
    },
  })
}

/**
 * Unlinks the Discord account, clearing `discordId` in the cache immediately.
 */
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

/**
 * Result of storing a GDDL API key.
 *
 * The key is write-only from the client's perspective: it goes up to be
 * encrypted server-side, and the only thing ever read back is `MeData`'s
 * `hasGddlApiKey` flag. Never log, cache, or echo the key itself.
 */
export interface SetGddlApiKeyResult {
  me: MeData
  // GDDL account name confirmed during verification — shown in the success
  // message, not persisted.
  gddlName: string
}

/**
 * Stores a GDDL API key after the server verifies it.
 *
 * @returns {@link SetGddlApiKeyResult} — the updated user plus the GDDL
 * username the key resolved to. The key itself is never read back.
 */
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

/**
 * Clears the stored GDDL API key.
 */
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

/**
 * Counts from a completed GDDL sync, plus the per-level reasons for anything that failed.
 */
export interface GddlSyncResult {
  created: number
  enriched: number
  skipped: number
  errors: { levelId: string; reason: string }[]
}

/**
 * The user's most recent GDDL sync job. See `startedAt` for why `id` cannot be used to tell runs apart.
 */
export interface GddlSyncJobStatus {
  id: string
  status: 'pending' | 'completed' | 'failed'
  result: GddlSyncResult | null
  error: string | null
  // ISO timestamp identifying this specific sync run — `id` is stable
  // forever per user (a new sync reuses the same row), so this is what
  // distinguishes "this run" for acknowledgment and toast deduplication.
  startedAt: string
}

/**
 * Starts an async sync job. Returns the jobId immediately (202); the id is
 * only used to key the "Syncing…" loading toast shown right away — actual
 * progress/completion is picked up by useGddlSyncStatus's poll.
 */
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

/**
 * Cache key for the GDDL sync job poll. One key app-wide — the job is per user, not per page.
 */
export const gddlSyncStatusQueryKey = ['gddl-sync'] as const

/**
 * Always enabled (not keyed by a jobId prop) so it can be mounted app-wide —
 * mirrors useImportStatus for spreadsheet import. GET /v1/me/gddl-sync
 * returns the user's most recent job regardless of which tab/page started
 * it, so this survives navigation and a full page reload without any
 * client-side job-id tracking. Polls every 2s while a job is "pending"; a
 * `null` result means the user has never run a sync.
 */
export function useGddlSyncStatus() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: gddlSyncStatusQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<GddlSyncJobStatus | null> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: GddlSyncJobStatus | null }>(
        '/v1/me/gddl-sync',
        { token, method: 'GET' }
      )
      return data
    },
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 2000 : false,
    retry: false,
  })
}

/**
 * Marks a completed/failed job acknowledged so GET /v1/me/gddl-sync stops
 * returning it — called right after GddlSyncProvider shows the toast for it.
 * Server-side (not localStorage) so it works regardless of client storage
 * being cleared and across devices/browsers for the same account. `startedAt`
 * (echoed back from the job GddlSyncProvider just displayed) scopes the ack
 * to that specific run — `id` alone is stable forever per user, so without
 * it a delayed ack could land on a different, later run that reused the
 * same row. Retries a couple times since nothing else retries a failed ack.
 */
export function useAckGddlSync() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      job: Pick<GddlSyncJobStatus, 'id' | 'startedAt'>
    ): Promise<void> => {
      const token = await getIdToken()
      await apiFetch('/v1/me/gddl-sync/ack', {
        token,
        method: 'POST',
        body: { jobId: job.id, startedAt: job.startedAt },
      })
    },
    retry: 2,
    onSettled: () => {
      // Re-fetch rather than optimistically clear the cache: the ack may
      // have been a no-op (superseded by a newer run), so let the server
      // response be the source of truth for what's visible next.
      void queryClient.invalidateQueries({ queryKey: gddlSyncStatusQueryKey })
    },
  })
}

/**
 * What moved in one direction of a list sync. Every array holds level ids.
 */
export interface GddlListSyncSummary {
  addedToInferno: string[]
  addedToGddl: string[]
  removedFromGddl: string[]
  skipped: string[]
}

/**
 * The two-list diff from a GDDL list sync.
 */
export interface GddlListSyncResult {
  favorites: GddlListSyncSummary
  leastFavorites: GddlListSyncSummary
}

/**
 * Synchronously syncs InfernoLog FAVORITES/LEAST_FAVORITES with the
 * corresponding GDDL user lists. Returns the diff summary.
 */
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

/**
 * A partial settings patch. Omitted fields are left alone; every field here is optimistically applied to the `me` cache before the request lands.
 */
export interface UpdateMeInput {
  profilePublic?: boolean
  discordPublic?: boolean
  defaultFps?: number
  defaultPercentageVersion?: GdVersion
  defaultDevice?: Device
  dateFormatPreference?: DateFormatPreference
  showHighlightUrl?: boolean
  autoExpandFabLabels?: boolean
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

/**
 * Every settings-page save mutation shares one of these keys; the
 * `useSettingsSaveNotifier` hook (apps/web/src/features/settings/hooks)
 * listens for them as a group so one "Saved" toast fires per burst.
 */
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

/**
 * Patches account settings, optimistically.
 *
 * Serialized under one mutation scope and only refetched once the queue has
 * drained, so a burst of toggles doesn't produce a burst of refetches — each
 * one landing would otherwise stomp the optimistic state of the toggles still
 * in flight.
 */
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

/**
 * The shape of a 403 from the username endpoint: a rename is on cooldown until `nextAllowedAt` (ISO).
 */
export interface UsernameCooldownError {
  status: 403
  nextAllowedAt: string
}

/**
 * Changes the username. Fails with a {@link UsernameCooldownError} body when a rename is still on cooldown.
 */
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

/**
 * Active weights (categories plus enjoymentWeight when enabled) must sum to
 * exactly 1.00, validated with integer-cents math (no float tolerance).
 * Keep in sync with @infernolog/core's RatingConfigSchema.
 */
export const RATING_WEIGHT_SUM_TARGET_CENTS = 100

/**
 * A whole rating configuration, replacing the previous one.
 *
 * Categories without an `id` are new. Active weights must sum to exactly
 * 1.00 — see {@link RATING_WEIGHT_SUM_TARGET_CENTS}.
 */
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

/**
 * Replaces the rating configuration — categories and enjoyment together, since their weights must sum as a set.
 */
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

/**
 * The exact phrase the user must type to confirm account deletion.
 */
export const DELETE_ACCOUNT_CONFIRMATION = 'Delete this account'

/**
 * Deletes the account and everything attached to it. Irreversible.
 */
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

/**
 * Username availability check (debounced calls in the editor)
 */
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
