// ⚠️ CREDENTIALS — holds the typed verification code until submitted.

import { useState, type FormEvent } from 'react'
import { VerificationCodeSchema } from '@infernolog/core'
import { useSignUpFlow } from '../SignUpFlowProvider'

/**
 * The code step: the six-digit code, resending it, and going back to change
 * the address.
 */
export function useVerifyCodeStep() {
  const flow = useSignUpFlow()
  const [verificationCode, setVerificationCode] = useState('')

  const canSubmit =
    VerificationCodeSchema.safeParse(verificationCode).success && !flow.pending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    await flow.submitCode(verificationCode.trim())
  }

  const resend = async () => {
    setVerificationCode('')
    await flow.resendCode()
  }

  return {
    email: flow.email,
    verificationCode,
    // Digits only: a pasted "123 456" or "123-456" still lands as six digits.
    setVerificationCode: (value: string) =>
      setVerificationCode(value.replace(/\D/g, '').slice(0, 6)),
    canSubmit,
    pending: flow.pending,
    error: flow.error,
    resent: flow.resent,
    submit,
    resend,
    changeEmail: flow.changeEmail,
  }
}
