import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const { amplify, hub, cache, sentry } = vi.hoisted(() => ({
  amplify: {
    fetchAuthSession: vi.fn(),
    signInWithRedirect: vi.fn(),
    signOut: vi.fn(),
  },
  hub: { listen: vi.fn(), handlers: [] as ((p: unknown) => void)[] },
  cache: { clear: vi.fn(), removeClient: vi.fn() },
  sentry: { captureException: vi.fn() },
}))

vi.mock('aws-amplify/auth', () => amplify)
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: hub.listen } }))
vi.mock('@/lib/queryClient', () => ({ queryClient: { clear: cache.clear } }))
vi.mock('@/lib/persister', () => ({
  persister: { removeClient: cache.removeClient },
}))
vi.mock('@/lib/sentry', () => ({ Sentry: sentry }))

const { AUTH_INTENT_KEY, AuthProvider, useAuth } =
  await import('../AuthContext')

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

/** A session carrying (or lacking) an ID token, for the given identity. */
const session = (token: string | null, userSub = 'sub-a') =>
  token
    ? { tokens: { idToken: { toString: () => token } }, userSub }
    : { tokens: undefined }

/** Fires an Amplify auth Hub event at the provider's listener. */
const emit = (event: string, data?: unknown) =>
  act(() => {
    for (const handler of hub.handlers) handler({ payload: { event, data } })
  })

/**
 * A refresh failure Amplify treats as the end of the session — it clears the
 * stored tokens on these, so only a new sign-in gets the visitor back.
 */
const terminal = () => ({
  name: 'NotAuthorizedException',
  message: 'Refresh Token has expired',
})

/**
 * A refresh failure Amplify treats as retryable — it keeps the stored tokens,
 * because the session is fine and only the call to Cognito failed.
 */
const transient = () => ({ name: 'NetworkError', message: 'Failed to fetch' })

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
  localStorage.clear()
  cache.clear.mockClear()
  cache.removeClient.mockClear()
  sentry.captureException.mockClear()
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

  // A failed lookup is not an app error, and must still finish initializing
  // or the app hangs on its splash.
  it('finishes initializing even when the session lookup fails', async () => {
    amplify.fetchAuthSession.mockRejectedValue(transient())
    const { result } = render()

    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
  })

  // Amplify clears the stored tokens on these before rejecting, so there is
  // nothing left to recover and the cache has to go with them.
  it('drops the cached account data when the session is really over', async () => {
    amplify.fetchAuthSession.mockRejectedValue(terminal())
    const { result } = render()

    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
    expect(cache.clear).toHaveBeenCalled()
    expect(cache.removeClient).toHaveBeenCalled()
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
  // The OAuth round trip lands on a fresh page load, so the mount-time read
  // usually happens before Amplify has finished the code exchange and sees no
  // tokens — this event is where the session first becomes readable, which is
  // why the provider re-reads it rather than just flipping the flag.
  it('re-reads the session and marks the visitor signed in', async () => {
    amplify.fetchAuthSession.mockResolvedValue(session(null))
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))
    amplify.fetchAuthSession.mockResolvedValue(session('id-token'))

    emit('signedIn')

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
  })

  // A refresh failure only belongs here when Amplify classified it as the end
  // of the session; the transient ones are covered below.
  const endingEvents: [string, unknown][] = [
    ['signedOut', undefined],
    ['tokenRefresh_failure', { error: terminal() }],
  ]

  it.each(endingEvents)(
    'marks the visitor signed out on %s',
    async (event, data) => {
      const { result } = render()
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

      emit(event, data)

      expect(result.current.isAuthenticated).toBe(false)
    }
  )

  // The cache holds one account's levels, collections, and ratings. Leaving
  // it behind would show them to whoever signs in next on this browser.
  it.each(endingEvents)(
    'clears the cached account data on %s',
    async (event, data) => {
      const { result } = render()
      await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

      emit(event, data)

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

  // The persisted cache is one fixed localStorage key, so without this the
  // second account to use a browser mounts holding the first account's email
  // and progress. Authenticated routes block on isAuthInitializing, which is
  // what keeps the discard ahead of the first render.
  it('discards a cache belonging to a different account before reporting the session', async () => {
    localStorage.setItem('infernolog:cache-owner', 'sub-previous')

    const { result } = render()
    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))

    expect(cache.clear).toHaveBeenCalled()
    expect(cache.removeClient).toHaveBeenCalled()
    expect(localStorage.getItem('infernolog:cache-owner')).toBe('sub-a')
  })

  it('keeps the cache when the same account returns', async () => {
    localStorage.setItem('infernolog:cache-owner', 'sub-a')

    const { result } = render()
    await waitFor(() => expect(result.current.isAuthInitializing).toBe(false))

    expect(cache.clear).not.toHaveBeenCalled()
  })

  // An expiring token is not a sign-out, and wiping the cache on one would
  // drop everything the user is looking at.
  it('leaves the cache alone on an ordinary token refresh', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    // Mount claims the cache for this identity, which discards it once (see
    // cacheOwner.ts). Only what the event itself does is under test here.
    cache.clear.mockClear()
    amplify.fetchAuthSession.mockClear()

    emit('tokenRefresh')

    await waitFor(() => expect(amplify.fetchAuthSession).toHaveBeenCalled())
    expect(cache.clear).not.toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(true)
  })

  // The bug this whole split exists for: Amplify dispatches this for a dead
  // network moment too, having kept tokens it still considers good. Ending the
  // session on one strands a visitor on the landing page with no way back.
  it('keeps the visitor signed in when a refresh failure is only transient', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    cache.clear.mockClear()

    emit('tokenRefresh_failure', { error: transient() })

    expect(result.current.isAuthenticated).toBe(true)
    expect(cache.clear).not.toHaveBeenCalled()
  })

  // Nothing else sees these — the provider swallowed them before, so how often
  // this fires in production was unknowable.
  it('reports a transient refresh failure', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
    const error = transient()

    emit('tokenRefresh_failure', { error })

    expect(sentry.captureException).toHaveBeenCalledWith(error)
  })

  // An ordinary end of session is not a fault, and reporting it would bury the
  // transient ones in noise.
  it('does not report a refresh failure that simply ended the session', async () => {
    const { result } = render()
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))

    emit('tokenRefresh_failure', { error: terminal() })

    expect(sentry.captureException).not.toHaveBeenCalled()
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

// A browser that unloads an idle tab reloads it on return, against tokens
// that expired hours ago — so the mount read has to reach Cognito at exactly
// the moment a machine waking from sleep has no network yet. Amplify keeps the
// tokens in that case, so the session is still there; before these paths the
// provider had already written it off and nothing looked again, leaving the
// landing page up until the user reloaded by hand.
describe('recovering a session the mount read could not reach', () => {
  /** Mounts with the network down, then brings it back. */
  const renderRestoredOffline = async () => {
    amplify.fetchAuthSession.mockRejectedValue(transient())
    const view = render()
    await waitFor(() =>
      expect(view.result.current.isAuthInitializing).toBe(false)
    )
    expect(view.result.current.isAuthenticated).toBe(false)
    amplify.fetchAuthSession.mockResolvedValue(session('id-token'))
    return view
  }

  it('signs the visitor back in once the network returns', async () => {
    const { result } = await renderRestoredOffline()

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
  })

  it('signs the visitor back in when the tab is looked at again', async () => {
    const { result } = await renderRestoredOffline()

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
  })

  // The event fires on the way out too, and a tab being hidden tells us
  // nothing new about the session.
  it('does not re-read while the tab is on its way out of view', async () => {
    const { result } = await renderRestoredOffline()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    amplify.fetchAuthSession.mockClear()

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(amplify.fetchAuthSession).not.toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('signs the visitor back in when Amplify refreshes on its own', async () => {
    const { result } = await renderRestoredOffline()

    emit('tokenRefresh')

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true))
  })

  it('stops re-reading once unmounted', async () => {
    const { unmount } = await renderRestoredOffline()
    unmount()
    amplify.fetchAuthSession.mockClear()

    act(() => {
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(amplify.fetchAuthSession).not.toHaveBeenCalled()
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
