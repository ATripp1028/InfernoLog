import { Button } from '@/components/generic/button'
import { FieldError } from '@/components/generic/field-error'
import { Input } from '@/components/generic/input'
import { Label } from '@/components/generic/label'
import { PasswordInput } from '@/components/inputs/PasswordInput'
import { PasswordRuleChecklist } from '@/components/inputs/PasswordRuleChecklist'
import { useDetailsStep } from './useDetailsStep'

/**
 * Adding a password, step two: the email to sign in with and the password.
 */
export function DetailsStep() {
  const {
    email,
    setEmail,
    newPassword,
    setNewPassword,
    confirmation,
    setConfirmation,
    emailError,
    changesEmail,
    rules,
    mismatch,
    canSubmit,
    pending,
    error,
    submit,
  } = useDetailsStep()

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="setup-email">Sign-in email</Label>
        <Input
          id="setup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? true : undefined}
        />
        {emailError ? (
          <FieldError>{emailError}</FieldError>
        ) : (
          <p className="text-xs text-muted-foreground">
            {changesEmail
              ? "We'll send a code to this address, and it becomes your account email."
              : 'Your account email. Change it to sign in with a different address.'}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="setup-password">New password</Label>
        <PasswordInput
          id="setup-password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-describedby="setup-password-rules"
        />
        <PasswordRuleChecklist id="setup-password-rules" rules={rules} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="setup-confirm">Confirm new password</Label>
        <PasswordInput
          id="setup-confirm"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          aria-invalid={mismatch ? true : undefined}
        />
        {mismatch && <FieldError>Passwords don't match</FieldError>}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? 'Saving…' : changesEmail ? 'Send code' : 'Set password'}
        </Button>
      </div>
    </form>
  )
}
