import type { ReactNode, RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { DialogCloseButton } from './dialog-close-button'
import { DialogSurface, type DialogSize } from './dialog-surface'
import { SectionLabel } from '@/components/inputs/SectionLabel'

export type { DialogSize as ModalSize }

/**
 * Props for {@link Modal}.
 */
export interface ModalProps {
  open: boolean
  onClose: () => void
  /**
   * A write the user hasn't seen the result of yet. Seals the modal —
   * Escape, the overlay and the X all stop working — and fades the X. Pass
   * writes only; blocking on a search would trap the user behind a slow
   * network for no gain.
   */
  busy?: boolean
  size?: DialogSize
  /** Small uppercase kicker above the title — "COLLECTION · FAVORITES". */
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Rendered between the header and the scrolling body — a tab strip, say. */
  belowHeader?: ReactNode
  /** Rules the header off from the body. For bodies that scroll under it. */
  divided?: boolean
  /** Holds the panel open at a comfortable height so its content can't make
   *  it jump between a search's empty, loading and populated states. */
  tall?: boolean
  /** The scrolling body. Supplies its own padding — see the note on Modal. */
  children: ReactNode
  /** Footer contents. Modal draws the rule and padding; you own the layout. */
  footer?: ReactNode
  /**
   * Focused when the modal opens, on desktop only. Mobile deliberately keeps
   * focus on the close button: focusing a text field there throws the
   * on-screen keyboard over the sheet the user was trying to read.
   */
  autoFocusRef?: RefObject<HTMLElement | null>
}

/**
 * The app's form-and-browse modal: a header with a close button, a scrolling
 * body, and an optional footer, on top of {@link DialogSurface}.
 *
 * For a question rather than a task — "Delete this level?" — reach for
 * `AlertDialog` instead. It shares this one's surface but not its anatomy.
 *
 * The body is padding-neutral on purpose. Its content — full-bleed result rows
 * in one dialog, a padded form in the next — disagrees about edge treatment
 * often enough that a default here would be wrong as often as right. Header and
 * footer padding is Modal's, so those stay aligned across the app; match `px-5`
 * in the body when the content is meant to line up with them.
 */
export function Modal({
  open,
  onClose,
  busy = false,
  size = 'lg',
  eyebrow,
  title,
  subtitle,
  belowHeader,
  divided = false,
  tall = false,
  children,
  footer,
  autoFocusRef,
}: ModalProps) {
  return (
    <DialogSurface
      open={open}
      onDismiss={onClose}
      busy={busy}
      size={size}
      autoFocusRef={autoFocusRef}
      className={cn(
        'flex max-h-[88dvh] flex-col overflow-hidden md:max-h-[calc(100vh-4rem)]',
        tall && 'min-h-[70dvh] md:min-h-[520px]'
      )}
    >
      <div
        className={cn(
          'flex items-start justify-between gap-3 px-5 pb-3 pt-3 md:pt-4',
          divided && 'border-b border-border'
        )}
      >
        <div className="min-w-0">
          {eyebrow && <SectionLabel tone="primary">{eyebrow}</SectionLabel>}
          <Dialog.Title className="text-lg font-semibold text-text-primary">
            {title}
          </Dialog.Title>
          {subtitle && (
            <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>
          )}
        </div>
        <Dialog.Close asChild>
          <DialogCloseButton
            disabled={busy}
            className="mt-0.5 size-8 shrink-0 bg-bg-elevated hover:text-text-primary"
          />
        </Dialog.Close>
      </div>

      {belowHeader}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>

      {footer && (
        <div className="border-t border-border px-5 py-4">{footer}</div>
      )}
    </DialogSurface>
  )
}
