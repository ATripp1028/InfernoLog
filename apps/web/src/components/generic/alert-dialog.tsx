import * as Dialog from '@radix-ui/react-dialog'
import { Loader2 } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'
import {
  dialogContentAnimation,
  dialogOverlayAnimation,
} from '@/lib/dialogAnimation'

/**
 * A small centered confirm dialog over Radix Dialog (no extra dep). Used for
 * destructive confirmations like deleting a list entry.
 *
 * The dialog does NOT close itself on confirm — `onConfirm` is expected to
 * kick off a mutation whose pending state is passed back in as `isPending`.
 * While pending, the confirm/cancel buttons are disabled and dismissal
 * (escape/overlay click) is blocked; the caller closes the dialog (typically
 * on mutation success) via `onOpenChange`.
 */
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
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/60',
            dialogOverlayAnimation
          )}
        />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 w-full rounded-t-card border-t border-border bg-bg-surface p-5 pb-6 shadow-xl focus:outline-none',
            dialogContentAnimation,
            'md:inset-auto md:left-1/2 md:top-1/2 md:bottom-auto md:w-[calc(100vw-2rem)] md:max-w-sm md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-card md:border md:pb-5'
          )}
        >
          <div className="mx-auto mb-3 flex justify-center md:hidden">
            <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
          </div>
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
