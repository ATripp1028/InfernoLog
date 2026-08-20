import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  dialogContentAnimation,
  dialogOverlayAnimation,
} from '@/lib/dialogAnimation'
import { Button } from '@/components/generic/button'

interface EditModalShellProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: React.ReactNode
  /** Rendered between the header and the scrolling body — the tab strip. */
  belowHeader?: React.ReactNode
  children: React.ReactNode
  onSave: () => void
  isSaving: boolean
  saveDisabled: boolean
}

/**
 * The dialog chrome every edit modal shares — overlay, the mobile
 * bottom-sheet/desktop-centred card, header, scrolling body, and the
 * Cancel/Save footer. Only the fields inside differ between them.
 */
export function EditModalShell({
  open,
  onClose,
  title,
  subtitle,
  belowHeader,
  children,
  onSave,
  isSaving,
  saveDisabled,
}: EditModalShellProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm',
            dialogOverlayAnimation
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 focus:outline-none',
            dialogContentAnimation,
            'md:left-1/2 md:top-1/2 md:right-auto md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2',
            'inset-x-0 bottom-0 w-full md:w-[540px]'
          )}
        >
          <div className="flex max-h-[92dvh] flex-col rounded-t-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:max-h-[calc(100vh-4rem)] md:rounded-card">
            <div className="flex justify-center pb-1 pt-2 md:hidden">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>

            <div className="flex items-start justify-between px-5 pb-3 pt-4 md:pt-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-text-primary">
                  {title}
                </Dialog.Title>
                <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="mt-0.5 flex size-8 items-center justify-center rounded-md bg-bg-elevated text-text-secondary transition-colors hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            {belowHeader}

            <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-2 pt-1">
              {children}
              <div className="h-2" />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={isSaving || saveDisabled}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
