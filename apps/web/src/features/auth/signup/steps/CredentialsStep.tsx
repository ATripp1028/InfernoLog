import { Button } from '@/components/generic/button'
import { FieldError } from '@/components/generic/field-error'
import { Input } from '@/components/generic/input'
import { Label } from '@/components/generic/label'
import { PasswordInput } from '@/components/inputs/PasswordInput'
import { PasswordRuleChecklist } from '@/components/inputs/PasswordRuleChecklist'
import { AuthNoticeBanner } from '../../AuthLayout'
import { useCredentialsStep } from './useCredentialsStep'

/**
 * Signup, step one: the email to sign in with and a password.
 */
export function CredentialsStep() {
  const {
    email,
    setEmail,
    password,
    setPassword,
    confirmation,
    setConfirmation,
    emailError,
    rules,
    mismatch,
    canSubmit,
    pending,
    error,
    submit,
  } = useCredentialsStep()

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <h2 className="text-[15px] font-semibold">Sign up with email</h2>
      {error && (
        <AuthNoticeBanner tone="error">{error.message}</AuthNoticeBanner>
      )}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="signup-email">Email</Label>
          <span className="text-xs text-muted-foreground">
            Private, never shown to other players
          </span>
        </div>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          className="h-10"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? true : undefined}
          required
        />
        {emailError && <FieldError>{emailError}</FieldError>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-password">Password</Label>
        <PasswordInput
          id="signup-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="signup-password-rules"
          required
        />
        <PasswordRuleChecklist id="signup-password-rules" rules={rules} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="signup-confirm">Confirm password</Label>
        <PasswordInput
          id="signup-confirm"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          aria-invalid={mismatch ? true : undefined}
          required
        />
        {mismatch && <FieldError>Passwords don't match</FieldError>}
      </div>
      <Button type="submit" className="h-10 w-full" disabled={!canSubmit}>
        {pending ? 'Sending code…' : 'Continue'}
      </Button>
    </form>
  )
}
