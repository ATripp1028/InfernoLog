import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { queryClient } from '../lib/queryClient'
import { persister } from '../lib/persister'

interface AuthContextType {
  isAuthenticated: boolean
  isAuthInitializing: boolean
  signIn: () => void
  signInWithDiscord: () => Promise<void>
  signOut: () => void
  getIdToken: () => Promise<string>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthInitializing, setIsAuthInitializing] = useState(true)

  const refreshAuthStatus = useCallback(async () => {
    try {
      const session = await fetchAuthSession()
      setIsAuthenticated(!!session.tokens?.idToken)
    } catch {
      setIsAuthenticated(false)
    }
  }, [])

  useEffect(() => {
    refreshAuthStatus().finally(() => setIsAuthInitializing(false))
  }, [refreshAuthStatus])

  useEffect(() => {
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
          setIsAuthenticated(true)
          break
        case 'signedOut':
        case 'tokenRefresh_failure':
          setIsAuthenticated(false)
          queryClient.clear()
          persister.removeClient()
          break
      }
    })
    return () => unsubscribe()
  }, [])

  const getIdToken = async (): Promise<string> => {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    if (!token) throw new Error('No token available')
    return token
  }

  const handleSignIn = () => signInWithRedirect({ provider: 'Google' })
  const handleSignOut = () => signOut()

  const handleSignInWithDiscord = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/discord`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Failed to start Discord sign-in')
    const { url } = (await res.json()) as { url: string }
    window.location.href = url
  }

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isAuthInitializing,
      signIn: handleSignIn,
      signInWithDiscord: handleSignInWithDiscord,
      signOut: handleSignOut,
      getIdToken,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
