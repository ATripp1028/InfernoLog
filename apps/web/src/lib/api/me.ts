import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { ApiError, apiFetch } from './client'

export { ApiError }

export type ListSource = 'GDDL' | 'POINTERCRATE' | 'AREDL' | 'NLW' | 'OTHER'
export type RatingMode = 'SIMPLE' | 'WEIGHTED'
export type RatingDisplayScale = 'ZERO_TO_TEN' | 'ZERO_TO_HUNDRED'
export type DateFormatPreference = 'MDY' | 'DMY' | 'YMD' | 'ISO'

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
  dateFormatPreference: DateFormatPreference
  includeEnjoyment: boolean
  enjoymentWeight: number
  listPriorityOrder: ListSource[]
  ratingCategories: RatingCategory[]
  onboardingCompleted: boolean
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
// Settings mutations
// ─────────────────────────────────────────────

export interface UpdateMeInput {
  profilePublic?: boolean
  discordPublic?: boolean
  dateFormatPreference?: DateFormatPreference
  ratingMode?: RatingMode
  ratingDisplayScale?: RatingDisplayScale
  includeEnjoyment?: boolean
  enjoymentWeight?: number
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
const UPDATE_LIST_PRIORITY_KEY = ['updateListPriority'] as const

function isLastPending(
  queryClient: ReturnType<typeof useQueryClient>,
  mutationKey: readonly unknown[]
): boolean {
  // The current mutation is still counted while its callbacks run, so 1 means
  // there's nothing queued behind us.
  return (
    queryClient.isMutating({ mutationKey: mutationKey as unknown[] }) === 1
  )
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

export function useUpdateListPriority() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: UPDATE_LIST_PRIORITY_KEY,
    scope: { id: 'updateListPriority' },
    mutationFn: async (order: ListSource[]): Promise<MeData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: MeData }>(
        '/v1/me/list-priority',
        { token, method: 'PATCH', body: { order } }
      )
      return data
    },
    onMutate: async (order) => {
      await queryClient.cancelQueries({ queryKey: meQueryKey })
      const previous = queryClient.getQueryData<MeData>(meQueryKey)
      queryClient.setQueryData<MeData>(meQueryKey, (old) =>
        old ? { ...old, listPriorityOrder: order } : old
      )
      return { previous }
    },
    onError: (_err, _order, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(meQueryKey, ctx.previous)
    },
    onSettled: () => {
      if (isLastPending(queryClient, UPDATE_LIST_PRIORITY_KEY)) {
        return queryClient.invalidateQueries({ queryKey: meQueryKey })
      }
      return undefined
    },
  })
}

// ─────────────────────────────────────────────
// Rating config — bulk update (categories + enjoyment together)
// ─────────────────────────────────────────────

// Active weights (categories plus enjoymentWeight when enabled) must sum to
// this value within `RATING_WEIGHT_SUM_TOLERANCE`. Keep these in sync with
// @infernolog/core's RatingConfigSchema.
export const RATING_WEIGHT_SUM_TARGET = 1
export const RATING_WEIGHT_SUM_TOLERANCE = 0.0005

export interface RatingConfigInput {
  categories: Array<{
    id?: string
    name: string
    weight: number
  }>
  includeEnjoyment: boolean
  enjoymentWeight: number
}

export function useUpdateRatingConfig() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
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

// Username availability check (debounced calls in the editor)
export async function checkUsernameAvailable(
  username: string
): Promise<{ available: boolean; error?: string }> {
  const res = await fetch(
    `${import.meta.env.VITE_API_URL}/v1/users/check-username?username=${encodeURIComponent(username)}`
  )
  if (!res.ok) return { available: false, error: 'Could not check username' }
  return (await res.json()) as { available: boolean; error?: string }
}
