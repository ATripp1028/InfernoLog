import { useState } from 'react'
import { releaseCacheOwner } from '@/lib/cacheOwner'

/**
 * The three recovery actions behind {@link ErrorFallback}.
 *
 * All three navigate rather than re-render, because the boundary above them
 * has already unmounted a subtree that threw once — reusing the same JS
 * context tends to reproduce the crash on the first render after a retry.
 */
export interface ErrorFallbackActions {
  /** Re-requests the current URL. */
  reload: () => void
  /** Leaves the crashed route for the landing page. */
  goHome: () => void
  /** Drops the persisted query cache, then reloads. See {@link useErrorFallback}. */
  clearCachedData: () => void
  /** True while {@link clearCachedData} is in flight. */
  isClearing: boolean
}

/**
 * Recovery actions for the app's error fallback.
 *
 * `clearCachedData` exists because of how `lib/persister.ts` works: the whole
 * query cache lives under one localStorage key and is restored synchronously
 * at mount, before any component renders. If what it restores is what makes a
 * component throw, then reloading replays the crash forever and the user has
 * no way out of it short of clearing site data in devtools. Dropping the cache
 * deliberately does NOT sign the user out — the Amplify tokens are untouched,
 * so this costs a refetch, not a round trip through Google.
 *
 * Navigation is via `window.location` rather than the router: the router is a
 * plausible cause of the error being displayed, so the escape route must not
 * depend on it.
 */
export function useErrorFallback(): ErrorFallbackActions {
  const [isClearing, setIsClearing] = useState(false)

  return {
    reload: () => window.location.reload(),
    goHome: () => window.location.assign('/'),
    clearCachedData: () => {
      setIsClearing(true)
      // Reload whether or not the clear resolved: a storage failure here is
      // exactly the situation the user is trying to escape, so stranding them
      // on the fallback with a spinner would be the worst of both. The catch
      // has to come before the finally — `finally` re-raises, so chaining it
      // alone leaves an unhandled rejection, which Sentry then reports as a
      // crash of its own on top of the one being recovered from.
      void releaseCacheOwner()
        .catch(() => {})
        .finally(() => window.location.reload())
    },
    isClearing,
  }
}
