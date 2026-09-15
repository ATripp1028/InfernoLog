import type { MeData } from '@/lib/api/me'
import { ChangePasswordForm } from './ChangePasswordForm'
import { SetPasswordFlow } from './SetPasswordFlow'
import { usePasswordSettings } from './usePasswordSettings'

/**
 * The Password block in Account settings: change the password when the account
 * has one, add one when it doesn't.
 */
export function PasswordSettings({ me }: { me: MeData }) {
  const { hasPassword } = usePasswordSettings(me)
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">
          {hasPassword ? 'Change password' : 'Password'}
        </div>
        <p className="text-xs text-muted-foreground">
          {hasPassword
            ? "You'll need your current password."
            : 'Add a password so you can also sign in with your email, without Google.'}
        </p>
      </div>
      {hasPassword ? (
        <ChangePasswordForm me={me} />
      ) : (
        <SetPasswordFlow me={me} />
      )}
    </div>
  )
}
