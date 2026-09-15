import { Button } from '@/components/generic/button'
import { Card } from '@/components/generic/card'
import type { MeData } from '@/lib/api/me'
import { ChangeEmailDialog } from './ChangeEmailDialog'
import { useEmailSettings } from './useEmailSettings'

/**
 * The account email, masked unless shown, with a way to change it.
 */
export function EmailSettings({
  me,
  showEmails,
}: {
  me: MeData
  showEmails: boolean
}) {
  const { displayedEmail, open, openDialog, closeDialog } = useEmailSettings(
    me,
    showEmails
  )
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground">Email</div>
      <Card className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {displayedEmail}
          </div>
          <div className="text-xs text-muted-foreground">
            Used to sign in and recover your account. Never shown to other
            players.
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={openDialog}>
          Change email
        </Button>
      </Card>
      {open && <ChangeEmailDialog me={me} onClose={closeDialog} />}
    </div>
  )
}
