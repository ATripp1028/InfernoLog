// ⚠️ CREDENTIALS — holds the typed verification code until submitted.

import { useState, type FormEvent } from 'react'
import { VerificationCodeSchema } from '@infernolog/core'
import { useSetPasswordFlow } from '../SetPasswordFlowProvider'

/**
 * The code step, when the chosen email is new.
 */
export function useCodeStep() {
  const flow = useSetPasswordFlow()
  const [verificationCode, setVerificationCode] = useState('')
  const canSubmit =
    VerificationCodeSchema.safeParse(verificationCode).success && !flow.pending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    await flow.submitCode(verificationCode.trim())
  }

  return {
    email: flow.email,
    verificationCode,
    setVerificationCode: (value: string) =>
      setVerificationCode(value.replace(/\D/g, '').slice(0, 6)),
    canSubmit,
    pending: flow.pending,
    error: flow.error,
    submit,
    resend: () => {
      setVerificationCode('')
      void flow.resendCode()
    },
    back: flow.back,
  }
}
