import { Button } from '@/components/generic/button'
import { Label } from '@/components/generic/label'
import { VerificationCodeInput } from '@/components/inputs/VerificationCodeInput'
import { useCodeStep } from './useCodeStep'

/**
 * Adding a password, step three: the code sent to a new sign-in email.
 */
export function CodeStep() {
  const {
    email,
    verificationCode,
    setVerificationCode,
    canSubmit,
    pending,
    error,
    submit,
    resend,
    back,
  } = useCodeStep()

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-sm text-muted-foreground">
        If <span className="font-medium text-foreground">{email}</span> can be
        used, we've sent a 6-digit code to it. It expires in 15 minutes.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="setup-code">Verification code</Label>
        <VerificationCodeInput
          id="setup-code"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          className="max-w-[240px]"
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
          {pending ? 'Adding…' : 'Set password'}
        </Button>
      </div>
    </form>
  )
}
