import * as Sentry from '@sentry/react'
import { ApiError } from './api/client'

// Imported for its side effect as the very first import in main.tsx, mirroring
// the API's `import './sentry'` — ES module imports are hoisted, so this runs
// before lib/auth configures Amplify and is therefore in place to catch a
// throw from that configuration too.
//
// The DSN is baked in at build time by apps/web/sst.config.ts, which also
// derives the CSP's Sentry ingest origin from the same literal. There is no
// DSN in `pnpm dev` or under vitest, and `init` is skipped entirely in that
// case rather than left enabled with an empty DSN — a disabled-but-initialized
// SDK still logs a warning per event, which is noise in every local run.

const dsn = import.meta.env.VITE_SENTRY_DSN

/**
 * Statuses that mean "the request was refused for a reason the UI already
 * handles" rather than "something is broken".
 *
 * `apiFetch` throws {@link ApiError} for every non-2xx, including the ordinary
 * ones — a 401 on an expired token, a 404 for a level that isn't cached, the
 * 409 the collections code branches on, the 429 `formatRetryWait` renders. If
 * any of those reaches an error boundary or an unhandled rejection it would be
 * reported as a crash. 5xx is deliberately absent: a server error IS a bug.
 */
const EXPECTED_API_STATUSES = new Set([401, 403, 404, 409, 429])

/**
 * Substrings identifying a failed request rather than a failed program.
 *
 * Browsers word this differently (Chrome/Firefox `Failed to fetch`, Safari
 * `Load failed`, the abort path `AbortError`), and none of them are actionable
 * — they mean the user's connection dropped, they navigated mid-request, or an
 * extension intercepted the call.
 */
const NETWORK_NOISE = [
  'Failed to fetch',
  'Load failed',
  'NetworkError',
  'AbortError',
]

function isExpectedFailure(error: unknown): boolean {
  if (error instanceof ApiError) return EXPECTED_API_STATUSES.has(error.status)
  // Name AND message: `Failed to fetch`/`Load failed`/`NetworkError` are
  // messages, but an aborted fetch rejects with a DOMException whose *name* is
  // `AbortError` and whose message is prose ("The user aborted a request.").
  // DOMException does extend Error, so a message-only check never sees the
  // name and every abort would be reported — the same trap `UsernameEditor`
  // already documents.
  const text =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error ?? '')
  return NETWORK_NOISE.some((noise) => text.includes(noise))
}

if (dsn) {
  Sentry.init({
    dsn,
    // Set from `$app.stage` at deploy time (see apps/web/sst.config.ts).
    // Falling back to MODE only matters for a build that somehow ships a DSN
    // without a stage; MODE cannot tell the stages apart on its own, so it is
    // a last resort rather than the intended source.
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    // Performance tracing is deliberately off: `tracesSampleRate` is unset, so
    // the browser tracing integration in the defaults stays inert. This wiring
    // is for crashes, and a transaction on every navigation would spend the
    // quota that the crashes need. Turn it on by setting a rate here.
    //
    // Session Replay is off for the same reason plus a second one — it records
    // the DOM, which on this app includes the user's email and linked Discord
    // id on the settings page. Enabling it means configuring masking first.
    sendDefaultPii: false,
    beforeSend: (event, hint) =>
      isExpectedFailure(hint.originalException) ? null : event,
  })
}

/**
 * Tags subsequent events with the signed-in user, or clears the tag when
 * passed nothing.
 *
 * Takes the internal `User.id` (the UUID `MeData` carries), not the Cognito
 * sub and not the email: it is the same identifier the API authorizes against
 * via `c.get('userId')`, so an event here and a row in the database name the
 * same person without putting an address into the payload.
 *
 * @param userId - The signed-in user's internal id, or `undefined` when signed out.
 */
export function setSentryUser(userId: string | undefined): void {
  Sentry.setUser(userId ? { id: userId } : null)
}

/**
 * The event id a crash screen may show, or `null` when nothing was stored.
 *
 * Sentry mints an id for every capture whether or not there is a client bound
 * — `init` above is skipped without a DSN, which is every local, test and
 * fork build — and returns it either way. Displaying that id would send a bug
 * reporter chasing a reference that exists nowhere.
 *
 * @param eventId - The id the boundary got back from its capture call.
 */
export function reportedEventId(
  eventId: string | null | undefined
): string | null {
  return eventId && Sentry.getClient() ? eventId : null
}

export { Sentry }
