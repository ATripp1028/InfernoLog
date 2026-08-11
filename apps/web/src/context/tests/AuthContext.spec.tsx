import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const { amplify, hub, cache } = vi.hoisted(() => ({
  amplify: {
    fetchAuthSession: vi.fn(),
    signInWithRedirect: vi.fn(),
    signOut: vi.fn(),
  },
  hub: { listen: vi.fn(), handlers: [] as ((p: unknown) => void)[] },
  cache: { clear: vi.fn(), removeClient: vi.fn() },
}))

vi.mock('aws-amplify/auth', () => amplify)
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: hub.listen } }))
vi.mock('@/lib/queryClient', () => ({ queryClient: { clear: cache.clear } }))
vi.mock('@/lib/persister', () => ({
  persister: { removeClient: cache.removeClient },
}))

const { AUTH_INTENT_KEY, AuthProvider, useAuth } =
  await import('../AuthContext')

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

/** A session carrying (or lacking) an ID token. */
const session = (token: string | null) =>
  token
    ? { tokens: { idToken: { toString: () => token } } }
    : { tokens: undefined }

/** Fires an Amplify auth Hub event at the provider's listener. */
const emit = (event: string) =>
  act(() => {
    for (const handler of hub.handlers) handler({ payload: { event } })
  })

beforeEach(() => {
  hub.handlers = []
  hub.listen.mockImplementation(
    (_channel: string, handler: (p: unknown) => void) => {
      hub.handlers.push(handler)
      return () => {
        hub.handlers = hub.handlers.filter((h) => h !== handler)
      }
    }
  )
  amplify.fetchAuthSession.mockResolvedValue(session('id-token'))
  amplify.signInWithRedirect.mockResolvedValue(undefined)
  amplify.signOut.mockResolvedValue(undefined)
  sessionStorage.clear()
})

const render = () => renderHook(() => useAuth(), { wrapper })

describe('hydrating the session on mount', () => {
  // Every route that gates on auth reads this — treating "not yet known" as
  // "signed out" would bounce a signed-in user to the landing page.
  it('reports that it is still deciding', () => {
    expect(render().result.current.isAuthInitializing).toBe(true)
  })

  it('reports a signed-in visitor once the session resolves', async () => {
    const { result } = render()

    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('reports a signed-out visitor', async () => {
    amplify.fetchAuthSession.mockResolvedValue(session(null))
    const { result } = render()

    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
  })

  // A rejected session is the ordinary signed-out case, not an app error —
  // and it must still finish initializing or the app hangs on its splash.
  it('finishes initializing even when the session lookup fails', async () => {
    amplify.fetchAuthSession.mockRejectedValue(new Error('no session'))
    const { result } = render()

    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
  })
})

// Cognito has no built-in concept of Sign In and Sign Up being different
// requests, so the intent has to survive the OAuth redirect for AuthCallback
// to branch on it. See docs/AUTH.md.
describe('starting the OAuth round trip', () => {
  it('records that the user meant to sign in', () => {
    render().result.current.signIn()

    expect(sessionStorage.getItem(AUTH_INTENT_KEY)).toBe('signin')
  })

  it('records that the user meant to sign up', () => {
    render().result.current.signUp()

    expect(sessionStorage.getItem(AUTH_INTENT_KEY)).toBe('signup')
  })

  it.each(['signIn', 'signUp'] as const)(
    'sends %s through the Google provider',
    (method) => {
      render().result.current[method]()

      expect(amplify.signInWithRedirect).toHaveBeenCalledWith({
        provider: 'Google',
      })
    }
  )

  // The intent must be stored before the redirect, or the page is gone.
  it('records the intent before redirecting', () => {
    amplify.signInWithRedirect.mockImplementation(() => {
      expect(sessionStorage.getItem(AUTH_INTENT_KEY)).toBe('signup')
      return Promise.resolve()
    })

    render().result.current.signUp()

    expect(amplify.signInWithRedirect).toHaveBeenCalled()
  })

  it('overwrites a stale intent from an abandoned attempt', () => {
    const { result } = render()
    result.current.signUp()

    result.current.signIn()

    expect(sessionStorage.getItem(AUTH_INTENT_KEY)).toBe('signin')
  })
})

describe('the ID token accessor', () => {
  it('hands back the current token', async () => {
    await expect(render().result.current.getIdToken()).resolves.toBe('id-token')
  })

  // Callers await a string; resolving undefined would send `Bearer undefined`
  // to the API and read as a server-side auth bug.
  it('throws rather than resolving without one', async () => {
    amplify.fetchAuthSession.mockResolvedValue(session(null))

    await expect(render().result.current.getIdToken()).rejects.toThrow(
      'No token available'
    )
  })

  it('re-reads the session each time, so a refresh is picked up', async () => {
    const { result } = render()
    await result.current.getIdToken()
    amplify.fetchAuthSession.mockResolvedValue(session('fresher-token'))

    await expect(result.current.getIdToken()).resolves.toBe('fresher-token')
  })
})

// Amplify refreshes tokens and signs out on its own schedule, so the provider
// follows the Hub rather than only its own actions.
describe('following Amplify’s auth events', () => {
  it('marks the visitor signed in', async () => {
    amplify.fetchAuthSession.mockResolvedValue(session(null))
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))

    emit('signedIn')

    expect(result.current.isAuthenticated).toBe(true)
  })

  it.each(['signedOut', 'tokenRefresh_failure'])(
    'marks the visitor signed out on %s',
    async (event) => {
      const { result } = render()
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

      emit(event)

      expect(result.current.isAuthenticated).toBe(false)
    }
  )

  // The cache holds one account's levels, collections, and ratings. Leaving
  // it behind would show them to whoever signs in next on this browser.
  it.each(['signedOut', 'tokenRefresh_failure'])(
    'clears the cached account data on %s',
    async (event) => {
      const { result } = render()
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

      emit(event)

      expect(cache.clear).toHaveBeenCalled()
    }
  )

  // The persisted copy outlives the tab, so clearing memory alone would
  // restore the previous account's data on the next launch.
  it('clears the persisted cache too', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    emit('signedOut')

    expect(cache.removeClient).toHaveBeenCalled()
  })

  // An expiring token is not a sign-out, and wiping the cache on one would
  // drop everything the user is looking at.
  it('leaves the cache alone on an ordinary token refresh', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    emit('tokenRefresh')

    expect(cache.clear).not.toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('ignores events it does not handle', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    emit('customOAuthState')

    expect(result.current.isAuthenticated).toBe(true)
  })

  it('listens on the auth channel', () => {
    render()

    expect(hub.listen).toHaveBeenCalledWith('auth', expect.any(Function))
  })

  it('stops listening once unmounted', () => {
    const { unmount } = render()

    unmount()

    expect(hub.handlers).toHaveLength(0)
  })
})

describe('signing out', () => {
  it('asks Amplify to sign out', () => {
    render().result.current.signOut()

    expect(amplify.signOut).toHaveBeenCalled()
  })

  // The cache is cleared by the resulting Hub event, not here — so a sign-out
  // Amplify initiates on its own clears it too.
  it('leaves the cache clearing to the resulting event', () => {
    render().result.current.signOut()

    expect(cache.clear).not.toHaveBeenCalled()
  })
})

describe('using auth outside a provider', () => {
  it('throws rather than reporting a signed-out visitor', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/within AuthProvider/)
  })
})
