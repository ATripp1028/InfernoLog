import { forwardRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Props for {@link DialogCloseButton}. Everything a `<button>` takes, plus the
 * icon size. `className` is merged onto the base styles rather than replacing
 * them, so each dialog keeps its own sizing/hover tokens.
 */
export interface DialogCloseButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide icon size in px. Defaults to 16, which is what most headers use. */
  iconSize?: number
}

/**
 * The X in a dialog header.
 *
 * `disabled` is how a dialog says "I'm mid-write": the button fades out and
 * stops responding to pointers, which is the visible half of the rule its
 * overlay/Escape guards enforce invisibly. Both halves have to move together —
 * a dialog that blocks dismissal without dimming its X just looks broken — so
 * the fade lives here rather than being re-specified per dialog.
 *
 * Works under Radix's `Dialog.Close asChild` (the ref and props forward, and a
 * disabled button never fires Radix's close) as well as with a plain `onClick`
 * for the hand-rolled modals.
 */
export const DialogCloseButton = forwardRef<
  HTMLButtonElement,
  DialogCloseButtonProps
>(({ className, disabled, iconSize = 16, ...props }, ref) => (
  <button
    ref={ref}
    {...props}
    type="button"
    aria-label="Close"
    disabled={disabled}
    className={cn(
      'flex items-center justify-center rounded-md text-text-secondary transition',
      'disabled:pointer-events-none disabled:opacity-50',
      className
    )}
  >
    <X size={iconSize} />
  </button>
))
DialogCloseButton.displayName = 'DialogCloseButton'
