import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { useQueryClient } from '@tanstack/react-query'

interface AuthContextType {
  isAuthenticated: boolean
  isAuthInitializing: boolean
  signIn: () => void
  signOut: () => void
  getIdToken: () => Promise<string>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthInitializing, setIsAuthInitializing] = useState(true)
  const queryClient = useQueryClient()

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
          break
      }
    })
    return () => unsubscribe()
  }, [queryClient])

  const getIdToken = async (): Promise<string> => {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    if (!token) throw new Error('No token available')
    return token
  }

  const handleSignIn = () => signInWithRedirect({ provider: 'Google' })
  const handleSignOut = () => signOut()

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isAuthInitializing,
      signIn: handleSignIn,
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
