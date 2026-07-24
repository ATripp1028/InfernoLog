import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react'
import { fetchAuthSession, signInWithRedirect, signOut } from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { queryClient } from '../lib/queryClient'
import { persister } from '../lib/persister'
import { clearHandledGddlSyncJobId } from '../lib/gddlSyncStorage'

// Sign In and Sign Up both go through the same Cognito Google OAuth flow —
// Cognito has no built-in concept of the two being different requests. This
// key records which button the user clicked so AuthCallback can branch:
// Sign Up calls POST /v1/auth/signup/start to create the user row; Sign In
// checks for an existing one and rejects (discarding the Cognito identity)
// if none exists. See docs/AUTH.md.
export const AUTH_INTENT_KEY = 'authIntent'
export type AuthIntent = 'signin' | 'signup'

interface AuthContextType {
  isAuthenticated: boolean
  isAuthInitializing: boolean
  signIn: () => void
  signUp: () => void
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
          clearHandledGddlSyncJobId()
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

  const startOAuth = (intent: AuthIntent) => {
    sessionStorage.setItem(AUTH_INTENT_KEY, intent)
    return signInWithRedirect({ provider: 'Google' })
  }
  const handleSignIn = () => startOAuth('signin')
  const handleSignUp = () => startOAuth('signup')
  const handleSignOut = () => signOut()

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isAuthInitializing,
        signIn: handleSignIn,
        signUp: handleSignUp,
        signOut: handleSignOut,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
