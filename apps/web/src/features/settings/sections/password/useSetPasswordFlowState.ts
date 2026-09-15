// ⚠️ CREDENTIALS — the add-a-password flow holds the chosen password in memory
// between the details step and the code step, plus the typed code. React state
// only: never logged, never written to storage, gone when Settings unmounts.
// The Google re-confirmation it uses waits in sessionStorage between the
// callback and here (lib/googleProof.ts), and is removed once used. See
// CLAUDE.md "Credential handling".

import { useState } from 'react'
import { AuthErrorCode } from '@infernolog/core'
import { toast } from '@/components/generic/sonner'
import { authErrorCode } from '@/lib/api/authOnboarding'
import {
  useCompletePasswordSetup,
  useStartPasswordSetup,
  type MeData,
} from '@/lib/api/me'
import {
  clearGoogleProof,
  peekGoogleProof,
  startGoogleProof,
} from '@/lib/googleProof'
import { Sentry } from '@/lib/sentry'

/** The add-a-password flow's steps, in order. */
export type SetPasswordStep = 'reconfirm' | 'details' | 'code'

/**
 * Adding a password to a Google-only account.
 *
 * reconfirm (leave for Google, come back with a proof) → details (email and
 * password) → code, only when the email isn't the account's → done. The email
 * chosen becomes the account's email.
 */
export function useSetPasswordFlowState(me: MeData) {
  const start = useStartPasswordSetup()
  const complete = useCompletePasswordSetup()
  const [googleProof, setGoogleProof] = useState(() =>
    peekGoogleProof('password-setup')
  )
  const [step, setStep] = useState<SetPasswordStep>(() =>
    googleProof ? 'details' : 'reconfirm'
  )
  const [email, setEmail] = useState(me.email)
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const pending = start.isPending || complete.isPending || redirecting

  const fail = (err: unknown) => {
    switch (authErrorCode(err)) {
      case AuthErrorCode.REAUTH_REQUIRED:
        // Stale or spent: back to confirming with Google.
        clearGoogleProof()
        setGoogleProof(null)
        setNewPassword('')
        setStep('reconfirm')
        setError('That Google confirmation expired. Confirm again to continue.')
        return
      case AuthErrorCode.INVALID_CODE:
        setError('That code is incorrect or has expired.')
        return
      case AuthErrorCode.RATE_LIMITED:
        setError('Too many codes have been requested. Try again in an hour.')
        return
      case AuthErrorCode.ACCOUNT_EXISTS:
        setStep('details')
        setError('An account already uses this email. Choose a different one.')
        return
      default:
        Sentry.captureException(err)
        setError('Couldn’t add a password. Please try again.')
    }
  }

  const finish = async (verificationCode?: string) => {
    if (!googleProof) return
    await complete.mutateAsync({
      email,
      newPassword,
      googleProof,
      ...(verificationCode ? { verificationCode } : {}),
    })
    clearGoogleProof()
    setNewPassword('')
    toast.success('Password added. You can now sign in with your email.')
  }

  /** Leaves for Google; the callback brings a proof back to this flow. */
  const reconfirm = async () => {
    setError(null)
    setRedirecting(true)
    try {
      await startGoogleProof('password-setup')
    } catch (err) {
      Sentry.captureException(err)
      setError('Couldn’t start confirming with Google. Please try again.')
      setRedirecting(false)
    }
  }

  /** Submits the email and password; asks for a code if the email is new. */
  const submitDetails = async (nextEmail: string, nextPassword: string) => {
    if (!googleProof) return
    setError(null)
    setEmail(nextEmail)
    setNewPassword(nextPassword)
    try {
      const { codeRequired } = await start.mutateAsync({
        email: nextEmail,
        googleProof,
      })
      if (codeRequired) {
        setStep('code')
        return
      }
      await complete.mutateAsync({
        email: nextEmail,
        newPassword: nextPassword,
        googleProof,
      })
      clearGoogleProof()
      setNewPassword('')
      toast.success('Password added. You can now sign in with your email.')
    } catch (err) {
      fail(err)
    }
  }

  /** Sends another code to the chosen email. */
  const resendCode = async () => {
    if (!googleProof) return
    setError(null)
    try {
      await start.mutateAsync({ email, googleProof })
      toast.success('We sent a new code.')
    } catch (err) {
      fail(err)
    }
  }

  /** Submits the emailed code and adds the password. */
  const submitCode = async (verificationCode: string) => {
    setError(null)
    try {
      await finish(verificationCode)
    } catch (err) {
      fail(err)
    }
  }

  /** Back to the details step to change the email. */
  const back = () => {
    setError(null)
    setStep('details')
  }

  return {
    step,
    email,
    accountEmail: me.email,
    pending,
    error,
    reconfirm,
    submitDetails,
    resendCode,
    submitCode,
    back,
  }
}
