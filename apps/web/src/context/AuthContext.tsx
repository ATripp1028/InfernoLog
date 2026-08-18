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
import { claimCacheOwner, releaseCacheOwner } from '@/lib/cacheOwner'

/**
 * Sign In and Sign Up both go through the same Cognito Google OAuth flow —
 * Cognito has no built-in concept of the two being different requests. This
 * key records which button the user clicked so AuthCallback can branch:
 * Sign Up calls POST /v1/auth/signup/start to create the user row; Sign In
 * checks for an existing one and rejects (discarding the Cognito identity)
 * if none exists. See docs/AUTH.md.
 */
export const AUTH_INTENT_KEY = 'authIntent'
/**
 * Which button started the OAuth round trip. Sign-in with no matching account is rejected rather than creating one, so the two paths cannot be merged.
 */
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

/**
 * Provides Cognito auth state and hydrates the app user from `GET /v1/me` on mount.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthInitializing, setIsAuthInitializing] = useState(true)

  // Claims the persisted cache for whoever is signed in before reporting the
  // session as usable. Authenticated routes block on `isAuthInitializing`, so
  // doing the claim inside this call is what keeps a previous account's
  // restored cache from reaching a single render.
  const refreshAuthStatus = useCallback(async () => {
    try {
      const session = await fetchAuthSession()
      const signedIn = !!session.tokens?.idToken
      if (signedIn && session.userSub) await claimCacheOwner(session.userSub)
      setIsAuthenticated(signedIn)
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
        // The OAuth round trip lands on a fresh page load, so the mount-time
        // fetchAuthSession above usually runs before Amplify has finished the
        // code exchange and sees no tokens. This event is where the identity
        // first becomes known on that path, so the claim has to happen here
        // too — refreshAuthStatus re-reads the session and does both.
        case 'signedIn':
          void refreshAuthStatus()
          break
        case 'signedOut':
        case 'tokenRefresh_failure':
          setIsAuthenticated(false)
          void releaseCacheOwner()
          break
      }
    })
    return () => unsubscribe()
  }, [refreshAuthStatus])

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

/**
 * The current auth state and token accessor. Throws outside an {@link AuthProvider}.
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
