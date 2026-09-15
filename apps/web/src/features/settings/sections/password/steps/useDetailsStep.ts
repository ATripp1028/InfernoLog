// ⚠️ CREDENTIALS — holds the typed password and its confirmation until
// submitted. Never log them, never persist them.

import { useState, type FormEvent } from 'react'
import {
  EmailSchema,
  PasswordSchema,
  passwordRuleResults,
} from '@infernolog/core'
import { useSetPasswordFlow } from '../SetPasswordFlowProvider'

/**
 * The details step: the sign-in email (prefilled with the account's) and the
 * new password, confirmed.
 */
export function useDetailsStep() {
  const flow = useSetPasswordFlow()
  const [email, setEmail] = useState(flow.email)
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)

  const rules = passwordRuleResults(newPassword)
  const mismatch = confirmation.length > 0 && confirmation !== newPassword
  const changesEmail =
    email.trim().toLowerCase() !== flow.accountEmail.toLowerCase()
  const canSubmit =
    email.trim().length > 0 &&
    PasswordSchema.safeParse(newPassword).success &&
    confirmation === newPassword &&
    !flow.pending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = EmailSchema.safeParse(email)
    if (!parsed.success) {
      setEmailError(
        parsed.error.issues[0]?.message ?? 'Enter a valid email address'
      )
      return
    }
    setEmailError(null)
    if (!canSubmit) return
    await flow.submitDetails(parsed.data, newPassword)
  }

  return {
    email,
    setEmail,
    newPassword,
    setNewPassword,
    confirmation,
    setConfirmation,
    emailError,
    changesEmail,
    rules,
    mismatch,
    canSubmit,
    pending: flow.pending,
    error: flow.error,
    submit,
  }
}
