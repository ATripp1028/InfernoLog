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

export function useUpdateMe() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
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
      const previous = queryClient.getQueryData<MeData>(meQueryKey)
      // Optimistically apply scalar fields. Don't touch ratingCategories —
      // those come back from the server (the seed step may have populated them).
      queryClient.setQueryData<MeData>(meQueryKey, (old) =>
        old ? { ...old, ...input } : old
      )
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(meQueryKey, ctx.previous)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, data)
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
    mutationFn: async (order: ListSource[]): Promise<MeData> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: MeData }>(
        '/v1/me/list-priority',
        { token, method: 'PATCH', body: { order } }
      )
      return data
    },
    onMutate: async (order) => {
      const previous = queryClient.getQueryData<MeData>(meQueryKey)
      queryClient.setQueryData<MeData>(meQueryKey, (old) =>
        old ? { ...old, listPriorityOrder: order } : old
      )
      return { previous }
    },
    onError: (_err, _order, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(meQueryKey, ctx.previous)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(meQueryKey, data)
    },
  })
}

// ─────────────────────────────────────────────
// Rating category mutations
// ─────────────────────────────────────────────

function patchCategories(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (cats: RatingCategory[]) => RatingCategory[]
) {
  queryClient.setQueryData<MeData>(meQueryKey, (old) =>
    old ? { ...old, ratingCategories: updater(old.ratingCategories) } : old
  )
}

export function useCreateRatingCategory() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      weight: number
    }): Promise<RatingCategory> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: RatingCategory }>(
        '/v1/me/rating-categories',
        { token, method: 'POST', body: input }
      )
      return data
    },
    onSuccess: (cat) => {
      patchCategories(queryClient, (cats) => [...cats, cat])
    },
  })
}

export function useUpdateRatingCategory() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      name?: string
      weight?: number
    }): Promise<RatingCategory> => {
      const token = await getIdToken()
      const { id, ...patch } = input
      const { data } = await apiFetch<{ data: RatingCategory }>(
        `/v1/me/rating-categories/${id}`,
        { token, method: 'PATCH', body: patch }
      )
      return data
    },
    onMutate: async (input) => {
      const previous = queryClient.getQueryData<MeData>(meQueryKey)
      patchCategories(queryClient, (cats) =>
        cats.map((c) =>
          c.id === input.id
            ? {
                ...c,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.weight !== undefined
                  ? { weight: input.weight }
                  : {}),
              }
            : c
        )
      )
      return { previous }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(meQueryKey, ctx.previous)
    },
    onSuccess: (cat) => {
      patchCategories(queryClient, (cats) =>
        cats.map((c) => (c.id === cat.id ? cat : c))
      )
    },
  })
}

export function useDeleteRatingCategory() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/rating-categories/${id}`, {
        token,
        method: 'DELETE',
      })
    },
    onSuccess: (_data, id) => {
      patchCategories(queryClient, (cats) => cats.filter((c) => c.id !== id))
    },
  })
}

export function useReorderRatingCategories() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]): Promise<RatingCategory[]> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: RatingCategory[] }>(
        '/v1/me/rating-categories/order',
        { token, method: 'PUT', body: { ids } }
      )
      return data
    },
    onMutate: async (ids) => {
      const previous = queryClient.getQueryData<MeData>(meQueryKey)
      patchCategories(queryClient, (cats) => {
        const byId = new Map(cats.map((c) => [c.id, c]))
        return ids
          .map((id, idx) => {
            const c = byId.get(id)
            return c ? { ...c, sortOrder: idx } : null
          })
          .filter((c): c is RatingCategory => c !== null)
      })
      return { previous }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(meQueryKey, ctx.previous)
    },
    onSuccess: (cats) => {
      patchCategories(queryClient, () => cats)
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
