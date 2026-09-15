// Logic for the Google re-confirmation callback (pages/GoogleProofComplete.tsx).
//
// The hosted UI returns here with a code. This exchanges it (lib/googleProof.ts),
// then does what the re-confirmation was started for: connect the Google
// account, or keep the proof for the password setup form in Settings.

import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { authErrorCode } from '@/lib/api/authOnboarding'
import { useConnectGoogle } from '@/lib/api/me'
import { Sentry } from '@/lib/sentry'
import {
  GoogleProofFlowError,
  completeGoogleProof,
  storeGoogleProof,
} from '@/lib/googleProof'

/**
 * Finishes the re-confirmation, then leaves for /settings with the outcome as
 * `google=connected`, `google=error&reason=…`, or `google=reconfirmed`.
 *
 * @param search - The callback's `code`, `state`, and `error` parameters.
 */
export function useGoogleProofComplete(search: {
  code?: string | undefined
  state?: string | undefined
  error?: string | undefined
}) {
  const navigate = useNavigate()
  const { mutateAsync: connectGoogle } = useConnectGoogle()

  // Single use, like the Discord callback: the code and the pending PKCE
  // record are spent on the first run, and StrictMode runs effects twice.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const leaveWith = (outcome: Record<string, string>) =>
      void navigate({ to: '/settings', replace: true, search: outcome })

    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(search)) {
      if (value) params.set(key, value)
    }

    void (async () => {
      let proof
      try {
        proof = await completeGoogleProof(params)
      } catch (error) {
        if (!(error instanceof GoogleProofFlowError))
          Sentry.captureException(error)
        const reason =
          error instanceof GoogleProofFlowError
            ? error.reason
            : 'exchange-failed'
        leaveWith({ google: 'error', reason })
        return
      }

      if (proof.purpose === 'password-setup') {
        storeGoogleProof('password-setup', proof.idToken)
        leaveWith({ google: 'reconfirmed' })
        return
      }

      try {
        await connectGoogle({ googleProof: proof.idToken })
        leaveWith({ google: 'connected' })
      } catch (error) {
        const reason = authErrorCode(error)
        if (!reason) Sentry.captureException(error)
        leaveWith({ google: 'error', reason: reason ?? 'internal_error' })
      }
    })()
  }, [search, connectGoogle, navigate])
}
