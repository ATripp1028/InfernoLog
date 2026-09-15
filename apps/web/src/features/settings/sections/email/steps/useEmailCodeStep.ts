// ⚠️ CREDENTIALS — holds the typed verification code until submitted.

import { useState, type FormEvent } from 'react'
import { VerificationCodeSchema } from '@infernolog/core'
import { useChangeEmailFlow } from '../ChangeEmailFlowProvider'

/**
 * The code step: the code sent to the new address.
 */
export function useEmailCodeStep() {
  const flow = useChangeEmailFlow()
  const [verificationCode, setVerificationCode] = useState('')
  const canSubmit =
    VerificationCodeSchema.safeParse(verificationCode).success && !flow.pending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    await flow.submitCode(verificationCode.trim())
  }

  return {
    newEmail: flow.newEmail,
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
