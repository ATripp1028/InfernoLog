import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Hub } from 'aws-amplify/utils'
import {
  useAuth,
  AUTH_INTENT_KEY,
  NO_ACCOUNT_FOUND_KEY,
  type AuthIntent,
} from '../context/AuthContext'
import { signupStart, signinReject } from '../lib/api/authOnboarding'
import { apiFetch, ApiError } from '../lib/api/client'
import type { MeData } from '../lib/api/me'
import { Button } from '@/components/ui/button'

// Sign In and Sign Up both land here after Google OAuth completes — Cognito
// itself makes no distinction between the two. AUTH_INTENT_KEY (set before
// the redirect, in AuthContext) is how we tell them apart:
//   - signup: age gate already passed pre-OAuth — create the users row and
//     head into onboarding.
//   - signin: check for a matching users row. No match means this Google
//     account never signed up — synchronously discard the Cognito identity
//     (no InfernoLog row is ever created for this path) and bounce out.
export function AuthCallback() {
  const navigate = useNavigate()
  const { isAuthenticated, getIdToken, signOut } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const handledRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || handledRef.current) return
    handledRef.current = true

    const intent =
      (sessionStorage.getItem(AUTH_INTENT_KEY) as AuthIntent | null) ?? 'signin'
    sessionStorage.removeItem(AUTH_INTENT_KEY)

    void (async () => {
      try {
        const token = await getIdToken()

        if (intent === 'signup') {
          const { onboardingCompleted } = await signupStart(token)
          // This Google account may already have an InfernoLog account
          // (signed up by mistake instead of using Sign In) — in that case
          // signupStart returned the existing, already-onboarded row rather
          // than creating anything, so just log them in normally.
          navigate({
            to: onboardingCompleted ? '/list' : '/onboarding',
            replace: true,
          })
          return
        }

        try {
          await apiFetch<{ data: MeData }>('/v1/me', { token, method: 'GET' })
          navigate({ to: '/list', replace: true })
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            await signinReject(token)
            sessionStorage.setItem(NO_ACCOUNT_FOUND_KEY, '1')
            signOut()
            return
          }
          throw err
        }
      } catch (err) {
        console.error('AuthCallback error', err)
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })()
  }, [isAuthenticated, getIdToken, signOut, navigate])

  useEffect(() => {
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signInWithRedirect_failure') {
        console.error('Hub: sign in failed', payload.data)
        navigate({ to: '/', replace: true })
      }
    })
    return () => unsubscribe()
  }, [navigate])

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
        <Button variant="outline" onClick={() => navigate({ to: '/' })}>
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  )
}
