// ⚠️ CREDENTIALS — holds the typed password and its confirmation in state until
// submitted. Never log them, never persist them.

import { useState, type FormEvent } from 'react'
import {
  EmailSchema,
  PasswordSchema,
  passwordRuleResults,
} from '@infernolog/core'
import { useSignUpFlow } from '../SignUpFlowProvider'

/**
 * The credentials step: email, password and confirmation, with the live rule
 * checklist and the checks that run before anything is sent.
 */
export function useCredentialsStep() {
  const flow = useSignUpFlow()
  const [email, setEmail] = useState(flow.email)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)

  const rules = passwordRuleResults(password)
  const passwordValid = PasswordSchema.safeParse(password).success
  const mismatch = confirmation.length > 0 && confirmation !== password
  const canSubmit =
    email.trim().length > 0 &&
    passwordValid &&
    confirmation === password &&
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
    await flow.submitCredentials(parsed.data, password)
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    confirmation,
    setConfirmation,
    emailError,
    rules,
    mismatch,
    canSubmit,
    pending: flow.pending,
    error: flow.error,
    submit,
  }
}
