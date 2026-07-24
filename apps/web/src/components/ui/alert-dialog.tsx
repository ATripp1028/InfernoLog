import * as Dialog from '@radix-ui/react-dialog'
import { Loader2 } from 'lucide-react'
import { Button } from './button'

// A small centered confirm dialog over Radix Dialog (no extra dep). Used for
// destructive confirmations like deleting a list entry.
//
// The dialog does NOT close itself on confirm — `onConfirm` is expected to
// kick off a mutation whose pending state is passed back in as `isPending`.
// While pending, the confirm/cancel buttons are disabled and dismissal
// (escape/overlay click) is blocked; the caller closes the dialog (typically
// on mutation success) via `onOpenChange`.
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  isPending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  isPending?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (isPending) return
        onOpenChange(o)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-card border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="text-base font-semibold text-text-primary">
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="mt-1.5 text-sm text-text-secondary">
              {description}
            </Dialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="outline" size="sm" disabled={isPending}>
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              size="sm"
              disabled={isPending}
              onClick={onConfirm}
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
