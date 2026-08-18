// Logic for the Discord link completion page (src/pages/DiscordLinkComplete.tsx).
//
// This page exists so the Discord authorization code is spent by a request
// carrying the user's JWT. The API's redirect target is public and cannot
// authenticate anyone, so it forwards `code` and `state` here instead of acting
// on them; this hook posts them back to an authenticated endpoint that refuses
// unless the state names the signed-in account. See
// apps/api/src/routes/auth/discord.ts for the CSRF that structure closes.

import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCompleteDiscordLink } from '@/lib/api/me'
import { ApiError } from '@/lib/api/client'

/** The `reason` codes the settings page turns into copy. */
type FailureReason =
  | 'invalid_state'
  | 'state_mismatch'
  | 'already_linked_elsewhere'
  | 'exchange_failed'
  | 'missing_code'
  | 'internal_error'

// The API sends a machine-readable `reason` on every expected failure. Anything
// else (a 500, a network drop) is reported as a generic internal error rather
// than guessed at.
function failureReason(error: unknown): FailureReason {
  if (error instanceof ApiError) {
    const body = error.body
    if (body && typeof body === 'object' && 'reason' in body) {
      const reason = (body as { reason: unknown }).reason
      if (typeof reason === 'string') return reason as FailureReason
    }
  }
  return 'internal_error'
}

/**
 * Completes the Discord link, then leaves for /settings with the outcome.
 *
 * The page renders only a spinner, so everything it does happens here: post the
 * code once, then navigate to the settings page with either `discord=connected`
 * or `discord=error&reason=…`, which the existing settings effect already
 * turns into a toast.
 *
 * @param code - The Discord authorization code, forwarded by the API bouncer.
 * @param state - The signed state minted when the flow started.
 */
export function useDiscordLinkComplete(
  code: string | undefined,
  state: string | undefined
) {
  const navigate = useNavigate()
  const { mutate } = useCompleteDiscordLink()

  // The code is single-use: Discord rejects a second exchange of the same one.
  // React 18 StrictMode double-invokes effects in development, and without this
  // guard the second invocation would spend an already-spent code and report a
  // spurious failure over a link that actually succeeded.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const leaveWith = (search: Record<string, string>) =>
      void navigate({ to: '/settings', replace: true, search })

    if (!code || !state) {
      leaveWith({ discord: 'error', reason: 'missing_code' })
      return
    }

    mutate(
      { code, state },
      {
        onSuccess: () => leaveWith({ discord: 'connected' }),
        onError: (error) =>
          leaveWith({ discord: 'error', reason: failureReason(error) }),
      }
    )
  }, [code, state, mutate, navigate])
}
