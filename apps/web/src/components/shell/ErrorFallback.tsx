import { Button } from '@/components/generic/button'
import { Card } from '@/components/generic/card'
import { useErrorFallback } from './useErrorFallback'

/**
 * Props for {@link ErrorFallback}.
 */
export interface ErrorFallbackProps {
  /** The thrown value, rendered only in dev. */
  error?: unknown
  /** Sentry's id for the reported event, shown so a user can quote it in a bug report. */
  eventId?: string | null
}

function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return null
}

/**
 * The app's crash screen, rendered by every error boundary.
 *
 * Shown in place of a white page when a render throws — from a route (via
 * `RouteErrorFallback`) or from the providers above the router (via the
 * `Sentry.ErrorBoundary` in `main.tsx`). Reporting is the boundary's job, not
 * this component's, so it can be rendered in a spec without sending anything.
 *
 * The thrown message is dev-only. In production it is at best meaningless to
 * the reader and at worst names internals; the event id is the thing that
 * actually helps, since it points at the full report.
 */
export function ErrorFallback({ error, eventId }: ErrorFallbackProps) {
  const { reload, goHome, clearCachedData, isClearing } = useErrorFallback()
  const message = import.meta.env.DEV ? errorMessage(error) : null

  return (
    <div
      role="alert"
      className="flex min-h-screen w-full items-center justify-center p-6"
    >
      <Card className="w-full max-w-md p-6">
        <h1 className="text-lg font-medium text-text-primary">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          This page hit an error and couldn&apos;t finish loading. Your logged
          progress is safe — it lives on the server, not in this tab.
        </p>

        {message && (
          <pre className="mt-4 overflow-x-auto rounded-md bg-bg-elevated p-3 text-xs text-danger">
            {message}
          </pre>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={reload}>Reload page</Button>
          <Button variant="outline" onClick={goHome}>
            Go home
          </Button>
        </div>

        <div className="mt-4 border-t border-border-subtle pt-4">
          <p className="text-xs text-text-secondary">
            Still broken after reloading? Clearing this browser&apos;s saved
            copy of your data usually fixes it. You&apos;ll stay signed in.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 px-0"
            onClick={clearCachedData}
            disabled={isClearing}
          >
            {isClearing ? 'Clearing…' : 'Clear saved data and reload'}
          </Button>
        </div>

        {eventId && (
          <p className="mt-4 text-xs text-text-secondary">
            Error ID: <span className="font-mono">{eventId}</span>
          </p>
        )}
      </Card>
    </div>
  )
}
