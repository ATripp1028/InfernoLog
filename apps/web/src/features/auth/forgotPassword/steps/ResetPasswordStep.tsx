import { Button } from '@/components/generic/button'
import { FieldError } from '@/components/generic/field-error'
import { Label } from '@/components/generic/label'
import { PasswordInput } from '@/components/inputs/PasswordInput'
import { PasswordRuleChecklist } from '@/components/inputs/PasswordRuleChecklist'
import { VerificationCodeInput } from '@/components/inputs/VerificationCodeInput'
import { AuthNoticeBanner } from '../../AuthLayout'
import { useResetPasswordStep } from './useResetPasswordStep'

/**
 * Forgot password, step two: the emailed code and a new password.
 */
export function ResetPasswordStep() {
  const {
    email,
    verificationCode,
    setVerificationCode,
    newPassword,
    setNewPassword,
    confirmation,
    setConfirmation,
    rules,
    mismatch,
    canSubmit,
    pending,
    error,
    resent,
    submit,
    resend,
    changeEmail,
  } = useResetPasswordStep()

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          Step 2 of 2
        </p>
        <h2 className="text-lg font-semibold">Choose a new password</h2>
        <p className="text-sm text-muted-foreground">
          If an account uses{' '}
          <span className="font-medium text-foreground">{email}</span>, we've
          emailed it a code.
        </p>
      </div>
      {error && <AuthNoticeBanner tone="error">{error}</AuthNoticeBanner>}
      {resent && !error && (
        <AuthNoticeBanner tone="info">We sent a new code.</AuthNoticeBanner>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="reset-code">Code</Label>
        <VerificationCodeInput
          id="reset-code"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <PasswordInput
          id="reset-password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-describedby="reset-password-rules"
          required
        />
        <PasswordRuleChecklist id="reset-password-rules" rules={rules} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <PasswordInput
          id="reset-confirm"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          aria-invalid={mismatch ? true : undefined}
          required
        />
        {mismatch && <FieldError>Passwords don't match</FieldError>}
      </div>
      <p className="text-xs text-muted-foreground">
        Resetting your password signs you out on every device.
      </p>
      <Button type="submit" className="h-10 w-full" disabled={!canSubmit}>
        {pending ? 'Resetting…' : 'Reset password'}
      </Button>
      <p className="text-sm text-muted-foreground">
        No email?{' '}
        <button
          type="button"
          className="text-primary-light hover:underline disabled:opacity-50"
          onClick={() => void resend()}
          disabled={pending}
        >
          Resend code
        </button>{' '}
        ·{' '}
        <button
          type="button"
          className="text-primary-light hover:underline"
          onClick={changeEmail}
        >
          Use a different email
        </button>
      </p>
    </form>
  )
}
