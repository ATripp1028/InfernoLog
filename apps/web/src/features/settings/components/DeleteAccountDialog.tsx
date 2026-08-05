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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 w-full rounded-t-card border-t border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 pb-6 shadow-xl focus:outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-200 data-[state=open]:duration-300 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom md:inset-auto md:left-1/2 md:top-1/2 md:bottom-auto md:w-[calc(100vw-2rem)] md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:border md:pb-5 md:data-[state=closed]:slide-out-to-bottom-0 md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95 md:data-[state=closed]:fade-out-0 md:data-[state=open]:fade-in-0">
          <div className="mx-auto mb-3 flex justify-center md:hidden">
            <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
          </div>
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
