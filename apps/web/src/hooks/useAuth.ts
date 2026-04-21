import { useState, useEffect } from 'react'
import { fetchAuthSession, signInWithRedirect, signOut, getCurrentUser } from 'aws-amplify/auth'

interface AuthUser {
  userId: string
  email: string
  name: string
  username: string
  onboardingCompleted: boolean
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser()
      const session = await fetchAuthSession()
      const idToken = session.tokens?.idToken
      const token = idToken?.toString()

      const res = await fetch(`${import.meta.env.VITE_API_URL}/v1/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const { data } = await res.json()
        setUser({
          userId: currentUser.userId,
          email: data.email,
          name: idToken?.payload.name as string,
          username: data.username,
          onboardingCompleted: data.onboardingCompleted,
        })
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const signIn = () => signInWithRedirect({ provider: 'Google' })
  
  const handleSignOut = () => signOut()

  const getIdToken = async (): Promise<string> => {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    if (!token) throw new Error('No token available')
      return token
  }

  return { user, loading, signIn, signOut: handleSignOut, getIdToken }
}