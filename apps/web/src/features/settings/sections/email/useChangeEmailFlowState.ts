// ⚠️ CREDENTIALS — the change-email flow holds the current password (so a code
// can be resent without asking again) and the typed code in React state until
// the dialog closes. Never logged, never written to storage. A Google proof
// for an account without a password waits in sessionStorage between its
// callback and here, and is removed once used. See CLAUDE.md "Credential
// handling".

import { useState } from 'react'
import { AuthErrorCode } from '@infernolog/core'
import { toast } from '@/components/generic/sonner'
import { authErrorCode } from '@/lib/api/authOnboarding'
import {
  useStartEmailChange,
  useVerifyEmailChange,
  type MeData,
} from '@/lib/api/me'
import {
  clearGoogleProof,
  peekGoogleProof,
  startGoogleProof,
} from '@/lib/googleProof'
import { Sentry } from '@/lib/sentry'
import { findPasswordIdentity } from '../connectedAccounts'

/** The change-email flow's steps, in order. */
export type ChangeEmailStep = 'details' | 'code'

/**
 * Changing the account email: prove it's you and name the new address, then
 * enter the code sent there.
 *
 * @param me - The signed-in account.
 * @param onClose - Closes the dialog; called once the email has changed.
 */
export function useChangeEmailFlowState(me: MeData, onClose: () => void) {
  const start = useStartEmailChange()
  const verify = useVerifyEmailChange()
  const hasPassword = findPasswordIdentity(me.identities) !== undefined
  const [googleProof, setGoogleProof] = useState(() =>
    hasPassword ? null : peekGoogleProof('email-change')
  )
  const [step, setStep] = useState<ChangeEmailStep>('details')
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const fail = (err: unknown) => {
    switch (authErrorCode(err)) {
      case AuthErrorCode.CURRENT_PASSWORD_INCORRECT:
        setCurrentPassword('')
        setStep('details')
        setError("That's not your current password.")
        return
      case AuthErrorCode.TOO_MANY_ATTEMPTS:
        setError('Too many attempts. Try again in a few minutes.')
        return
      case AuthErrorCode.REAUTH_REQUIRED:
        clearGoogleProof()
        setGoogleProof(null)
        setStep('details')
        setError('That Google confirmation expired. Confirm again to continue.')
        return
      case AuthErrorCode.SAME_EMAIL:
        setError("That's already your email.")
        return
      case AuthErrorCode.RATE_LIMITED:
        setError('Too many codes have been requested. Try again in an hour.')
        return
      case AuthErrorCode.INVALID_CODE:
        setError('That code is incorrect or has expired.')
        return
      case AuthErrorCode.ACCOUNT_EXISTS:
        setStep('details')
        setError('An account already uses this email. Choose a different one.')
        return
      default:
        Sentry.captureException(err)
        setError('Couldn’t change your email. Please try again.')
    }
  }

  const sendCode = (address: string, password: string) =>
    start.mutateAsync(
      hasPassword
        ? { newEmail: address, currentPassword: password }
        : { newEmail: address, ...(googleProof ? { googleProof } : {}) }
    )

  /** Leaves for Google; the dialog reopens with the proof on the way back. */
  const reconfirm = async () => {
    setError(null)
    setRedirecting(true)
    try {
      await startGoogleProof('email-change')
    } catch (err) {
      Sentry.captureException(err)
      setError('Couldn’t start confirming with Google. Please try again.')
      setRedirecting(false)
    }
  }

  /** Proves who is asking and sends a code to the new address. */
  const submitDetails = async (address: string, password: string) => {
    setError(null)
    setNewEmail(address)
    setCurrentPassword(password)
    try {
      await sendCode(address, password)
      setStep('code')
    } catch (err) {
      fail(err)
    }
  }

  /** Sends another code to the same address. */
  const resendCode = async () => {
    setError(null)
    try {
      await sendCode(newEmail, currentPassword)
      toast.success('We sent a new code.')
    } catch (err) {
      fail(err)
    }
  }

  /** Changes the email with the code. */
  const submitCode = async (verificationCode: string) => {
    setError(null)
    try {
      await verify.mutateAsync({ newEmail, verificationCode })
    } catch (err) {
      fail(err)
      return
    }
    clearGoogleProof()
    setCurrentPassword('')
    toast.success('Email changed')
    onClose()
  }

  /** Abandons the change, dropping anything held for it. */
  const close = () => {
    clearGoogleProof()
    setCurrentPassword('')
    onClose()
  }

  return {
    step,
    hasPassword,
    googleConfirmed: googleProof !== null,
    newEmail,
    pending: start.isPending || verify.isPending || redirecting,
    error,
    reconfirm,
    submitDetails,
    resendCode,
    submitCode,
    back: () => {
      setError(null)
      setStep('details')
    },
    close,
  }
}
