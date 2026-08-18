import { useEffect, useRef, useState } from 'react'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Sentry } from '@/lib/sentry'
import { ErrorFallback } from './ErrorFallback'

/**
 * The router's crash screen, wired as `defaultErrorComponent` in `main.tsx`.
 *
 * TanStack Router catches route render errors in its own boundary, which means
 * the `Sentry.ErrorBoundary` above the router never sees them and would report
 * nothing. This adapter does the reporting the router's boundary skips, then
 * renders the shared {@link ErrorFallback}.
 *
 * `reset` is intentionally not offered as a retry button: it re-renders the
 * same route in the same JS context, which in practice throws again
 * immediately. The fallback's own actions reload instead.
 */
export function RouteErrorFallback({ error, info }: ErrorComponentProps) {
  const [eventId, setEventId] = useState<string | null>(null)
  // StrictMode runs effects twice in dev, and this component re-renders on
  // every parent render while it is mounted. Without the guard the same crash
  // is reported two or more times.
  const reported = useRef<unknown>(null)

  useEffect(() => {
    if (reported.current === error) return
    reported.current = error
    setEventId(
      // Scope-callback form rather than a hint object: `exactOptionalPropertyTypes`
      // rejects passing `contexts: undefined` for the no-component-stack case.
      Sentry.captureException(error, (scope) => {
        if (info) {
          scope.setContext('react', { componentStack: info.componentStack })
        }
        return scope
      })
    )
  }, [error, info])

  return <ErrorFallback error={error} eventId={eventId} />
}
