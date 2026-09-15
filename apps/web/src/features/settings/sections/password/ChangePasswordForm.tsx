import { Button } from '@/components/generic/button'
import { Card } from '@/components/generic/card'
import { FieldError } from '@/components/generic/field-error'
import { Label } from '@/components/generic/label'
import { Switch } from '@/components/generic/switch'
import { PasswordInput } from '@/components/inputs/PasswordInput'
import { PasswordRuleChecklist } from '@/components/inputs/PasswordRuleChecklist'
import type { MeData } from '@/lib/api/me'
import { useChangePasswordForm } from './useChangePasswordForm'

/**
 * Changes an existing password.
 */
export function ChangePasswordForm({ me }: { me: MeData }) {
  const {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmation,
    setConfirmation,
    signOutOthers,
    setSignOutOthers,
    currentPasswordError,
    error,
    rules,
    mismatch,
    canSubmit,
    pending,
    submit,
  } = useChangePasswordForm(me)

  return (
    <Card className="p-4">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="space-y-1.5">
          <Label htmlFor="change-current">Current password</Label>
          <PasswordInput
            id="change-current"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-invalid={currentPasswordError ? true : undefined}
          />
          {currentPasswordError && (
            <FieldError>{currentPasswordError}</FieldError>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="change-new">New password</Label>
          <PasswordInput
            id="change-new"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-describedby="change-new-rules"
          />
          <PasswordRuleChecklist id="change-new-rules" rules={rules} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="change-confirm">Confirm new password</Label>
          <PasswordInput
            id="change-confirm"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            aria-invalid={mismatch ? true : undefined}
          />
          {mismatch && <FieldError>Passwords don't match</FieldError>}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="change-sign-out"
            checked={signOutOthers}
            onCheckedChange={setSignOutOthers}
          />
          <Label
            htmlFor="change-sign-out"
            className="font-normal text-muted-foreground"
          >
            Sign out of all other devices
          </Label>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmit}>
            {pending ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
