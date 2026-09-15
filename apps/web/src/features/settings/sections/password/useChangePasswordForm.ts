// ⚠️ CREDENTIALS — holds the current and new passwords in component state until
// submitted, then clears them. Never log them, never persist them. See
// CLAUDE.md "Credential handling".

import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AuthErrorCode,
  PasswordSchema,
  passwordRuleResults,
} from '@infernolog/core'
import { toast } from '@/components/generic/sonner'
import { useAuth } from '@/context/AuthContext'
import { authErrorCode } from '@/lib/api/authOnboarding'
import { useChangePassword, type MeData } from '@/lib/api/me'
import { sessionUsesPassword } from '@/lib/sessionMethod'
import { Sentry } from '@/lib/sentry'
import { findPasswordIdentity } from '../connectedAccounts'

/**
 * The change-password form: current, new and confirmation, the rule
 * checklist, and whether to sign out other devices (on by default).
 */
export function useChangePasswordForm(me: MeData) {
  const { signInWithPassword } = useAuth()
  const navigate = useNavigate()
  const change = useChangePassword()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [currentPasswordError, setCurrentPasswordError] = useState<
    string | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  const rules = passwordRuleResults(newPassword)
  const mismatch = confirmation.length > 0 && confirmation !== newPassword
  const canSubmit =
    currentPassword.length > 0 &&
    PasswordSchema.safeParse(newPassword).success &&
    confirmation === newPassword &&
    !change.isPending

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmation('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)
    setCurrentPasswordError(null)

    // Read before the change: signing out other devices revokes this session
    // too when it signed in with the password, and it has to be re-opened.
    const reopenSession = signOutOthers && (await sessionUsesPassword())

    try {
      await change.mutateAsync({ currentPassword, newPassword, signOutOthers })
    } catch (err) {
      switch (authErrorCode(err)) {
        case AuthErrorCode.CURRENT_PASSWORD_INCORRECT:
          setCurrentPasswordError("That's not your current password.")
          setCurrentPassword('')
          return
        case AuthErrorCode.TOO_MANY_ATTEMPTS:
          setError('Too many attempts. Try again in a few minutes.')
          return
        default:
          Sentry.captureException(err)
          setError('Couldn’t change your password. Please try again.')
          return
      }
    }

    if (reopenSession) {
      const email = findPasswordIdentity(me.identities)?.email ?? me.email
      try {
        await signInWithPassword(email, newPassword)
      } catch (err) {
        Sentry.captureException(err)
        reset()
        toast.success('Password changed. Sign in with your new password.')
        await navigate({ to: '/signin', replace: true })
        return
      }
    }

    reset()
    toast.success(
      signOutOthers
        ? 'Password changed, and your other devices were signed out'
        : 'Password changed'
    )
  }

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmation,
    setConfirmation,
    signOutOthers,
    setSignOutOthers,
    currentPasswordError,
    error,
    rules,
    mismatch,
    canSubmit,
    pending: change.isPending,
    submit,
  }
}
