// ⚠️ CREDENTIALS — holds the typed current password until submitted.

import { useState, type FormEvent } from 'react'
import { EmailSchema } from '@infernolog/core'
import { useChangeEmailFlow } from '../ChangeEmailFlowProvider'

/**
 * The details step: the new address, plus the current password or a Google
 * re-confirmation.
 */
export function useEmailDetailsStep() {
  const flow = useChangeEmailFlow()
  const [newEmail, setNewEmail] = useState(flow.newEmail)
  const [currentPassword, setCurrentPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)

  const proven = flow.hasPassword
    ? currentPassword.length > 0
    : flow.googleConfirmed
  const canSubmit = newEmail.trim().length > 0 && proven && !flow.pending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = EmailSchema.safeParse(newEmail)
    if (!parsed.success) {
      setEmailError(
        parsed.error.issues[0]?.message ?? 'Enter a valid email address'
      )
      return
    }
    setEmailError(null)
    if (!canSubmit) return
    await flow.submitDetails(parsed.data, currentPassword)
  }

  return {
    newEmail,
    setNewEmail,
    currentPassword,
    setCurrentPassword,
    emailError,
    hasPassword: flow.hasPassword,
    googleConfirmed: flow.googleConfirmed,
    canSubmit,
    pending: flow.pending,
    error: flow.error,
    submit,
    reconfirm: () => void flow.reconfirm(),
    cancel: flow.close,
  }
}
