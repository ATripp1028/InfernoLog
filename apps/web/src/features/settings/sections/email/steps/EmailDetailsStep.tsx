import { Check } from 'lucide-react'
import { Button } from '@/components/generic/button'
import { FieldError } from '@/components/generic/field-error'
import { Input } from '@/components/generic/input'
import { Label } from '@/components/generic/label'
import { GoogleIcon } from '@/components/data/providerIcons'
import { PasswordInput } from '@/components/inputs/PasswordInput'
import { useEmailDetailsStep } from './useEmailDetailsStep'

/**
 * Changing email, step one: the new address, and proof it's you.
 */
export function EmailDetailsStep() {
  const {
    newEmail,
    setNewEmail,
    currentPassword,
    setCurrentPassword,
    emailError,
    hasPassword,
    googleConfirmed,
    canSubmit,
    pending,
    error,
    submit,
    reconfirm,
    cancel,
  } = useEmailDetailsStep()

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="space-y-1.5">
        <Label htmlFor="change-email-new">New email</Label>
        <Input
          id="change-email-new"
          type="email"
          autoComplete="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          aria-invalid={emailError ? true : undefined}
        />
        {emailError && <FieldError>{emailError}</FieldError>}
      </div>
      {hasPassword ? (
        <div className="space-y-1.5">
          <Label htmlFor="change-email-password">Current password</Label>
          <PasswordInput
            id="change-email-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
      ) : googleConfirmed ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <Check size={14} aria-hidden="true" />
          Confirmed with Google. Finish within 5 minutes.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            For your security, confirm it's you with Google first.
          </p>
          <Button
            type="button"
            variant="outline"
            className="gap-3"
            onClick={reconfirm}
            disabled={pending}
          >
            <GoogleIcon />
            Re-confirm with Google
          </Button>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {pending ? 'Sending code…' : 'Send code'}
        </Button>
      </div>
    </form>
  )
}
