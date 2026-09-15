import { Link } from '@tanstack/react-router'
import { Button } from '@/components/generic/button'
import { Label } from '@/components/generic/label'
import { VerificationCodeInput } from '@/components/inputs/VerificationCodeInput'
import { AuthNoticeBanner } from '../../AuthLayout'
import { useVerifyCodeStep } from './useVerifyCodeStep'

/**
 * Signup, step two: the code emailed to the address.
 *
 * The wording never says whether the address already has an account — its
 * owner learns that from the email instead.
 */
export function VerifyCodeStep() {
  const {
    email,
    verificationCode,
    setVerificationCode,
    canSubmit,
    pending,
    error,
    resent,
    submit,
    resend,
    changeEmail,
  } = useVerifyCodeStep()

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          Check your inbox
        </p>
        <h2 className="text-[15px] font-semibold">Enter your code</h2>
        <p className="text-sm text-muted-foreground">
          If <span className="font-medium text-foreground">{email}</span> can be
          used for a new account, we've sent a 6-digit code to it. The code
          expires in 15 minutes.
        </p>
      </div>
      {error && (
        <AuthNoticeBanner tone="error">
          {error.message}
          {error.kind === 'account-exists' && (
            <>
              {' '}
              <Link to="/signin" className="underline">
                Go to sign in
              </Link>
            </>
          )}
        </AuthNoticeBanner>
      )}
      {resent && !error && (
        <AuthNoticeBanner tone="info">We sent a new code.</AuthNoticeBanner>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="signup-code">Verification code</Label>
        <VerificationCodeInput
          id="signup-code"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          autoFocus
        />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={!canSubmit}>
        {pending ? 'Creating your account…' : 'Verify and continue'}
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
