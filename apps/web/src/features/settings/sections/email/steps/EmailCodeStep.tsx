import { Button } from '@/components/generic/button'
import { Label } from '@/components/generic/label'
import { VerificationCodeInput } from '@/components/inputs/VerificationCodeInput'
import { useEmailCodeStep } from './useEmailCodeStep'

/**
 * Changing email, step two: the code sent to the new address.
 */
export function EmailCodeStep() {
  const {
    newEmail,
    verificationCode,
    setVerificationCode,
    canSubmit,
    pending,
    error,
    submit,
    resend,
    back,
  } = useEmailCodeStep()

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-sm text-muted-foreground">
        If <span className="font-medium text-foreground">{newEmail}</span> can
        be used, we've sent a 6-digit code to it. It expires in 15 minutes. Your
        old address will be told about the change.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="change-email-code">Verification code</Label>
        <VerificationCodeInput
          id="change-email-code"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          autoFocus
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            className="text-primary-light hover:underline disabled:opacity-50"
            onClick={resend}
            disabled={pending}
          >
            Resend code
          </button>
          <button
            type="button"
            className="text-primary-light hover:underline"
            onClick={back}
          >
            Use a different email
          </button>
        </div>
        <Button type="submit" disabled={!canSubmit}>
          {pending ? 'Changing…' : 'Change email'}
        </Button>
      </div>
    </form>
  )
}
