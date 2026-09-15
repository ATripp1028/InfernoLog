// ⚠️ CREDENTIALS — this hook holds the typed password in component state and
// hands it to Cognito through AuthContext. Never log it, never persist it.
// See CLAUDE.md "Credential handling".

import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { signOut } from 'aws-amplify/auth'
import { EmailSchema } from '@infernolog/core'
import { useAuth } from '@/context/AuthContext'
import {
  passwordAuthErrorKind,
  PASSWORD_AUTH_ERROR_MESSAGES,
} from '@/context/passwordAuthErrors'
import { Sentry } from '@/lib/sentry'
import { clearAuthNotice, peekAuthNotice } from '../authNotice'
import { destinationAfterSignIn } from '../destinationAfterSignIn'

/**
 * The sign-in page: email-and-password form state and submission, the Google
 * button, and the one-shot notice a password reset leaves behind.
 */
export function useSignInPage() {
  const { signIn, signInWithPassword, getIdToken } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice] = useState(() =>
    peekAuthNotice() === 'password-reset' ? 'password-reset' : null
  )

  useEffect(() => {
    if (notice) clearAuthNotice()
  }, [notice])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsedEmail = EmailSchema.safeParse(email)
    if (!parsedEmail.success || !password) {
      setError(PASSWORD_AUTH_ERROR_MESSAGES['invalid-credentials'])
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await signInWithPassword(parsedEmail.data, password)
      const to = await destinationAfterSignIn(await getIdToken())
      setPassword('')
      await navigate({ to, replace: true })
    } catch (err) {
      const kind = passwordAuthErrorKind(err)
      if (kind === 'account-exists') {
        // An unfinished signup whose email became another account's: the API
        // discarded it, so the session it just opened names no one.
        await signOut().catch(() => undefined)
      }
      if (kind === 'unknown') Sentry.captureException(err)
      setError(PASSWORD_AUTH_ERROR_MESSAGES[kind])
      setSubmitting(false)
    }
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    submitting,
    error,
    notice,
    submit,
    signInWithGoogle: signIn,
  }
}
