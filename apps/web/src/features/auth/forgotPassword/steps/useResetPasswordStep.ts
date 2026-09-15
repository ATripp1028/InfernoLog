// ⚠️ CREDENTIALS — holds the typed code, new password and confirmation until
// submitted. Never log them, never persist them.

import { useState, type FormEvent } from 'react'
import {
  PasswordSchema,
  VerificationCodeSchema,
  passwordRuleResults,
} from '@infernolog/core'
import { useForgotPasswordFlow } from '../ForgotPasswordFlowProvider'

/**
 * The reset step: the emailed code and a new password, confirmed.
 */
export function useResetPasswordStep() {
  const flow = useForgotPasswordFlow()
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const rules = passwordRuleResults(newPassword)
  const mismatch = confirmation.length > 0 && confirmation !== newPassword
  const canSubmit =
    VerificationCodeSchema.safeParse(verificationCode).success &&
    PasswordSchema.safeParse(newPassword).success &&
    confirmation === newPassword &&
    !flow.pending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    await flow.resetWithCode(verificationCode.trim(), newPassword)
  }

  const resend = async () => {
    setVerificationCode('')
    await flow.resendCode()
  }

  return {
    email: flow.email,
    verificationCode,
    setVerificationCode: (value: string) =>
      setVerificationCode(value.replace(/\D/g, '').slice(0, 6)),
    newPassword,
    setNewPassword,
    confirmation,
    setConfirmation,
    rules,
    mismatch,
    canSubmit,
    pending: flow.pending,
    error: flow.error,
    resent: flow.resent,
    submit,
    resend,
    changeEmail: flow.changeEmail,
  }
}
