import { Button } from '@/components/generic/button'
import { FieldError } from '@/components/generic/field-error'
import { Input } from '@/components/generic/input'
import { Label } from '@/components/generic/label'
import { AuthNoticeBanner } from '../../AuthLayout'
import { useRequestCodeStep } from './useRequestCodeStep'

/**
 * Forgot password, step one: the address to send a code to.
 */
export function RequestCodeStep() {
  const { email, setEmail, emailError, pending, error, submit } =
    useRequestCodeStep()

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
          Step 1 of 2
        </p>
        <h2 className="text-lg font-semibold">Reset your password</h2>
        <p className="text-sm text-muted-foreground">
          Enter the email you sign in with, and we'll send you a code.
        </p>
      </div>
      {error && <AuthNoticeBanner tone="error">{error}</AuthNoticeBanner>}
      <div className="space-y-1.5">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
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
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? 'Sending code…' : 'Send code'}
      </Button>
    </form>
  )
}
