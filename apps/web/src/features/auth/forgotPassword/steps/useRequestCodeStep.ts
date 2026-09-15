import { useState, type FormEvent } from 'react'
import { EmailSchema } from '@infernolog/core'
import { useForgotPasswordFlow } from '../ForgotPasswordFlowProvider'

/**
 * The request step: which address to send a reset code to.
 */
export function useRequestCodeStep() {
  const flow = useForgotPasswordFlow()
  const [email, setEmail] = useState(flow.email)
  const [emailError, setEmailError] = useState<string | null>(null)

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
    await flow.requestCode(parsed.data)
  }

  return {
    email,
    setEmail,
    emailError,
    pending: flow.pending,
    error: flow.error,
    submit,
  }
}
