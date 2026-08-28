import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { signOut } from 'aws-amplify/auth'
import { SettingsSection } from '@/components/generic/settings-section'
import { AlertDialog } from '@/components/generic/alert-dialog'
import { Button } from '@/components/generic/button'
import { toast } from '@/components/generic/sonner'
import { DELETE_ACCOUNT_CONFIRMATION, useDeleteAccount } from '@/lib/api/me'
import { clearAllAppCookies } from '@/lib/cookies'

/**
 * Irreversible account actions.
 */
export function DangerZoneSection() {
  const [open, setOpen] = useState(false)
  const deleteAccount = useDeleteAccount()
  const navigate = useNavigate()

  const handleConfirm = async () => {
    try {
      await deleteAccount.mutateAsync()
      clearAllAppCookies()
      // Amplify's signedOut Hub event clears the query cache and persisted
      // cache — see AuthContext — so the deleted account's data never lingers
      // in memory or storage past this point.
      await signOut()
      setOpen(false)
      void navigate({ to: '/', replace: true })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete account'
      )
    }
  }

  return (
    <SettingsSection
      title="Danger Zone"
      description="Irreversible account actions."
      showSeparator={false}
    >
      <div className="flex items-start justify-between gap-6 rounded-card border border-danger/40 p-4">
        <div className="flex-1 space-y-1">
          <div className="text-sm font-medium text-foreground">
            Delete account
          </div>
          <p className="text-xs text-muted-foreground">
            Permanently deletes your account and all of your data. This cannot
            be undone.
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Delete Account
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="This permanently deletes your account and everything tied to it — completions, rankings, categories, collections, and preferences. This cannot be undone."
        confirmLabel="Delete account"
        confirmPhrase={DELETE_ACCOUNT_CONFIRMATION}
        destructive
        isPending={deleteAccount.isPending}
        onConfirm={() => void handleConfirm()}
      />
    </SettingsSection>
  )
}
