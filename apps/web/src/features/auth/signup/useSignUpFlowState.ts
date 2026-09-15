// ⚠️ CREDENTIALS — the signup flow holds the chosen password in memory between
// the credentials step and the code step (the API needs it at verify, after
// the address is proven), plus the typed code. React state only: never logged,
// never written to storage, and gone when the page unmounts. See CLAUDE.md
// "Credential handling".

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { signOut } from 'aws-amplify/auth'
import { useAuth } from '@/context/AuthContext'
import {
  passwordAuthErrorKind,
  PASSWORD_AUTH_ERROR_MESSAGES,
  type PasswordAuthErrorKind,
} from '@/context/passwordAuthErrors'
import {
  passwordSignupStart,
  passwordSignupVerify,
} from '@/lib/api/authOnboarding'
import { Sentry } from '@/lib/sentry'
import { destinationAfterSignIn } from '../destinationAfterSignIn'

/** The signup flow's steps, in order. */
export type SignUpStep = 'credentials' | 'verify'

/** A failure shown on the current step. */
export interface SignUpError {
  kind: PasswordAuthErrorKind
  message: string
}

function toError(err: unknown): SignUpError {
  const kind = passwordAuthErrorKind(err)
  if (kind === 'unknown') Sentry.captureException(err)
  return { kind, message: PASSWORD_AUTH_ERROR_MESSAGES[kind] }
}

/**
 * The email-and-password signup step machine.
 *
 * credentials → (API emails a code or a notice) → verify → (API creates the
 * sign-in) → sign in → create the account → onboarding.
 */
export function useSignUpFlowState() {
  const { signInWithPassword, getIdToken } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<SignUpStep>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<SignUpError | null>(null)
  const [resent, setResent] = useState(false)

  /**
   * Requests a code for the address and moves to the code step. The response
   * is the same whether or not the address already has an account; its owner
   * finds out from the email.
   */
  const submitCredentials = async (nextEmail: string, nextPassword: string) => {
    setPending(true)
    setError(null)
    try {
      await passwordSignupStart({ email: nextEmail })
      setEmail(nextEmail)
      setPassword(nextPassword)
      setResent(false)
      setStep('verify')
    } catch (err) {
      setError(toError(err))
    } finally {
      setPending(false)
    }
  }

  /** Sends a fresh code to the same address. */
  const resendCode = async () => {
    setPending(true)
    setError(null)
    try {
      await passwordSignupStart({ email })
      setResent(true)
    } catch (err) {
      setError(toError(err))
    } finally {
      setPending(false)
    }
  }

  /** Back to the credentials step to fix the address; the password is dropped. */
  const changeEmail = () => {
    setPassword('')
    setError(null)
    setResent(false)
    setStep('credentials')
  }

  /**
   * Proves the address with the code, then signs in and creates the account.
   * Stays on the code step on failure.
   */
  const submitCode = async (verificationCode: string) => {
    setPending(true)
    setError(null)
    try {
      await passwordSignupVerify({ email, verificationCode, password })
      await signInWithPassword(email, password)
      const to = await destinationAfterSignIn(await getIdToken())
      setPassword('')
      await navigate({ to, replace: true })
    } catch (err) {
      const next = toError(err)
      if (next.kind === 'account-exists') {
        // Raced by another signup for the same address after the code was
        // sent. If a session opened, it names a discarded identity.
        await signOut().catch(() => undefined)
      }
      setError(next)
      setPending(false)
    }
  }

  return {
    step,
    email,
    pending,
    error,
    resent,
    submitCredentials,
    resendCode,
    changeEmail,
    submitCode,
  }
}
