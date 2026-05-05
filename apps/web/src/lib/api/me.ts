import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'

export interface MeData {
  id: string
  username: string
  email: string
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
      if (!res.ok) throw new Error('Failed to load profile')
      const { data } = await res.json()
      return data as MeData
    },
  })
}
