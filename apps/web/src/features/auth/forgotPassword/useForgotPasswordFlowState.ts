// ⚠️ CREDENTIALS — the reset flow holds the emailed code and the new password
// in React state for as long as the page is open. Never logged, never written
// to storage. The code and password go straight to Cognito: the API is not
// involved in a password reset at all. See CLAUDE.md "Credential handling".

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { confirmResetPassword, resetPassword, signOut } from 'aws-amplify/auth'
import { useAuth } from '@/context/AuthContext'
import {
  passwordAuthErrorKind,
  PASSWORD_AUTH_ERROR_MESSAGES,
} from '@/context/passwordAuthErrors'
import { Sentry } from '@/lib/sentry'
import { setAuthNotice } from '../authNotice'

/** The reset flow's steps, in order. */
export type ForgotPasswordStep = 'request' | 'reset'

function messageFor(err: unknown): string {
  const kind = passwordAuthErrorKind(err)
  if (kind === 'unknown') Sentry.captureException(err)
  return PASSWORD_AUTH_ERROR_MESSAGES[kind]
}

/**
 * The forgot-password step machine, over Cognito's own ForgotPassword flow.
 *
 * Cognito issues, emails (through our SES identity) and checks the code. The
 * pool's preventUserExistenceErrors makes the request step succeed the same
 * way whether or not the address has a password, so the page never reveals
 * which addresses do.
 */
export function useForgotPasswordFlowState() {
  const { signInWithPassword } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<ForgotPasswordStep>('request')
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  const sendCode = async (address: string) => {
    await resetPassword({ username: address })
  }

  /** Asks Cognito to email a code, then moves to the reset step. */
  const requestCode = async (address: string) => {
    setPending(true)
    setError(null)
    try {
      await sendCode(address)
      setEmail(address)
      setResent(false)
      setStep('reset')
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setPending(false)
    }
  }

  /** Sends another code to the same address. */
  const resendCode = async () => {
    setPending(true)
    setError(null)
    try {
      await sendCode(email)
      setResent(true)
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setPending(false)
    }
  }

  /** Back to the request step to use a different address. */
  const changeEmail = () => {
    setError(null)
    setResent(false)
    setStep('request')
  }

  /**
   * Sets the new password with the code, signs every session out, and sends
   * the visitor to sign in.
   */
  const resetWithCode = async (
    verificationCode: string,
    newPassword: string
  ) => {
    setPending(true)
    setError(null)
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: verificationCode,
        newPassword,
      })
    } catch (err) {
      setError(messageFor(err))
      setPending(false)
      return
    }

    // The usual reason to reset a password is suspecting someone else has it,
    // and a reset alone leaves existing sessions' refresh tokens working. So
    // sign in once with the new password and sign out globally, which revokes
    // every one of them. Best effort: the reset itself already succeeded, and
    // a failure here must not tell the user it didn't.
    try {
      await signInWithPassword(email, newPassword)
      await signOut({ global: true })
    } catch (err) {
      Sentry.captureException(err)
      await signOut().catch(() => undefined)
    }

    setAuthNotice('password-reset')
    await navigate({ to: '/signin', replace: true })
  }

  return {
    step,
    email,
    pending,
    error,
    resent,
    requestCode,
    resendCode,
    changeEmail,
    resetWithCode,
  }
}
