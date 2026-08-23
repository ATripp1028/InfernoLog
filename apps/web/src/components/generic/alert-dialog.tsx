import { useEffect, useId, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2 } from 'lucide-react'
import { Button } from './button'
import { Input } from './input'
import { DialogSurface } from './dialog-surface'

/**
 * Props for {@link AlertDialog}.
 */
export interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /**
   * The confirm mutation's `isPending`. Named for what callers already hold
   * rather than matching `Modal`'s `busy`, since every call site passes a
   * TanStack mutation flag straight through.
   */
  isPending?: boolean
  onConfirm: () => void
  /**
   * Gate confirm behind typing this exact phrase. For the handful of actions
   * where a misplaced click is unrecoverable — deleting an account, not
   * deleting a list entry. Use it sparingly: asked for routinely it stops
   * being read, which is the opposite of the point.
   */
  confirmPhrase?: string
}

/**
 * A confirmation: a question, the stakes, and two answers.
 *
 * It does NOT close itself on confirm. `onConfirm` kicks off a mutation whose
 * pending state comes back as `isPending`; while that's true both buttons are
 * disabled and dismissal is blocked, and the caller closes the dialog — usually
 * on success — through `onOpenChange`. So the dialog stays put if the mutation
 * fails, which is where the error message needs it to be.
 *
 * For a task rather than a question — a form, a search, anything with a body
 * worth scrolling — reach for `Modal`. It shares this one's
 * {@link DialogSurface} but not its anatomy.
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
  confirmPhrase,
}: AlertDialogProps) {
  const [typed, setTyped] = useState('')
  const phraseRef = useRef<HTMLInputElement>(null)
  const phraseId = useId()

  // Clear the phrase whenever the dialog closes, so reopening it always asks
  // again — including after a failed attempt the caller left open.
  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  const phraseSatisfied = !confirmPhrase || typed === confirmPhrase

  return (
    <DialogSurface
      open={open}
      onDismiss={() => onOpenChange(false)}
      busy={isPending}
      size="sm"
      hasDescription={!!description}
      autoFocusRef={confirmPhrase ? phraseRef : undefined}
      className="px-5 pb-6 pt-2 md:pb-5 md:pt-5"
    >
      <Dialog.Title className="text-base font-semibold text-text-primary">
        {title}
      </Dialog.Title>
      {description && (
        <Dialog.Description className="mt-1.5 text-sm text-text-secondary">
          {description}
        </Dialog.Description>
      )}

      {confirmPhrase && (
        <div className="mt-4 space-y-1.5">
          <label htmlFor={phraseId} className="text-xs text-text-secondary">
            Type{' '}
            <span className="font-medium text-text-primary">
              {confirmPhrase}
            </span>{' '}
            to confirm
          </label>
          <Input
            id={phraseId}
            ref={phraseRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={isPending}
          />
        </div>
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
          disabled={isPending || !phraseSatisfied}
          onClick={onConfirm}
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          {confirmLabel}
        </Button>
      </div>
    </DialogSurface>
  )
}
