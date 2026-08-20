import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react'
import {
  fetchAuthSession,
  signInWithRedirect,
  signOut,
  type AuthSession,
} from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'
import { claimCacheOwner, releaseCacheOwner } from '@/lib/cacheOwner'
import { Sentry } from '@/lib/sentry'
import { isTerminalAuthError } from './authSessionErrors'

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
    let session: AuthSession
    try {
      session = await fetchAuthSession()
    } catch (error) {
      // A session that is genuinely over *resolves* with no tokens. A
      // rejection is a read that failed, and for the transient half of those
      // Amplify has kept tokens it considers still good — see
      // authSessionErrors.ts. Reporting one as signed out is what turned a tab
      // the browser had unloaded into the landing page until the user reloaded
      // by hand: the restore lands on expired tokens, the refresh needs a
      // network that is not back yet, and nothing re-read the session
      // afterwards. Leaving the flag alone lets the recovery paths below fix
      // it. The Hub listener reports these — it sees the same failures with
      // the underlying error attached.
      if (isTerminalAuthError(error)) {
        setIsAuthenticated(false)
        await releaseCacheOwner()
      }
      return
    }

    // Outside the try above deliberately: a cache eviction that throws is not
    // a failed session read, and must not be able to report one.
    const signedIn = !!session.tokens?.idToken
    if (signedIn) await claimCacheOwner(session.userSub)
    setIsAuthenticated(signedIn)
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
        // Amplify refreshes on its own schedule, so a refresh that succeeds is
        // the signal that a session an earlier read could not reach is usable
        // again. Without this the provider had no way back from that short of
        // a manual reload.
        case 'tokenRefresh':
          void refreshAuthStatus()
          break
        case 'signedOut':
          setIsAuthenticated(false)
          void releaseCacheOwner()
          break
        // Dispatched for every refresh failure, transient ones included, and
        // the only place the underlying error is available — so this is where
        // they get reported. Only the terminal ones end the session.
        case 'tokenRefresh_failure':
          if (!isTerminalAuthError(payload.data?.error)) {
            Sentry.captureException(payload.data?.error)
            break
          }
          setIsAuthenticated(false)
          void releaseCacheOwner()
          break
      }
    })
    return () => unsubscribe()
  }, [refreshAuthStatus])

  // The two moments a session written off as unreadable becomes readable
  // again, and the only things that re-read it after mount. A browser that
  // unloads an idle tab reloads it on return, so the mount read runs against
  // hours-expired tokens and has to reach Cognito — precisely when a machine
  // waking from sleep has no network. Cheap to run this often: with unexpired
  // tokens `fetchAuthSession` is a storage read and makes no network call.
  useEffect(() => {
    const recheck = () => void refreshAuthStatus()
    const recheckWhenVisible = () => {
      if (document.visibilityState === 'visible') recheck()
    }
    window.addEventListener('online', recheck)
    document.addEventListener('visibilitychange', recheckWhenVisible)
    return () => {
      window.removeEventListener('online', recheck)
      document.removeEventListener('visibilitychange', recheckWhenVisible)
    }
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
