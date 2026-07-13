import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DELETE_ACCOUNT_CONFIRMATION } from '@/lib/api/me'

interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isDeleting: boolean
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DeleteAccountDialogProps) {
  const [value, setValue] = useState('')
  const canDelete = value === DELETE_ACCOUNT_CONFIRMATION

  const handleOpenChange = (next: boolean) => {
    if (!next) setValue('')
    onOpenChange(next)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-card border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 shadow-xl focus:outline-none">
          <Dialog.Title className="text-base font-semibold text-text-primary">
            Delete your account?
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-text-secondary">
            This permanently deletes your account and everything tied to it —
            completions, rankings, categories, collections, and preferences.
            This cannot be undone.
          </Dialog.Description>

          <div className="mt-4 space-y-1.5">
            <label
              htmlFor="delete-account-confirm"
              className="text-xs text-text-secondary"
            >
              Type{' '}
              <span className="font-medium text-text-primary">
                {DELETE_ACCOUNT_CONFIRMATION}
              </span>{' '}
              to confirm
            </label>
            <Input
              id="delete-account-confirm"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={isDeleting}
            />
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline" size="sm" disabled={isDeleting}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant="destructive"
              size="sm"
              disabled={!canDelete || isDeleting}
              onClick={onConfirm}
            >
              {isDeleting ? 'Deleting…' : 'Delete account'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
