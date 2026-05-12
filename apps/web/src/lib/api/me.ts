import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface MeData {
  id: string
  username: string
  email: string
  discordId: string | null
  profilePublic: boolean
  discordPublic: boolean
  ratingMode: 'SIMPLE' | 'WEIGHTED'
  ratingDisplayScale: 'ZERO_TO_TEN' | 'ZERO_TO_HUNDRED'
  dateFormatPreference: 'MDY' | 'DMY' | 'YMD' | 'ISO'
  includeEnjoyment: boolean
  enjoymentWeight: number
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new ApiError(res.status, 'Failed to load profile')
      const { data } = await res.json()
      return data as MeData
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
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/me/connect-discord`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!res.ok)
        throw new ApiError(res.status, 'Failed to start Discord connection')
      const { data } = await res.json()
      return data as { url: string }
    },
  })
}

export function useDisconnectDiscord() {
  const { getIdToken } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const token = await getIdToken()
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/me/connect-discord`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      if (!res.ok)
        throw new ApiError(res.status, 'Failed to disconnect Discord')
    },
    onSuccess: () => {
      queryClient.setQueryData<MeData>(meQueryKey, (old) =>
        old ? { ...old, discordId: null } : old
      )
    },
  })
}
