import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode, RefObject } from 'react'
import { cn } from '@/lib/utils'
import {
  dialogContentAnimation,
  dialogOverlayAnimation,
} from '@/lib/dialogAnimation'
import { DialogCloseButton } from './dialog-close-button'
import { SectionLabel } from '@/components/inputs/SectionLabel'

// The breakpoint the panel switches shape at. Kept here rather than passed in:
// a modal that's a bottom sheet at a different width than its siblings is a
// bug, not a feature.
const DESKTOP_QUERY = '(min-width: 768px)'

// Desktop widths. Named rather than free-form so call sites pick from a set
// instead of inventing a fifth width that's 8px off one of these.
const modalWidths = {
  sm: 'md:w-[384px]',
  md: 'md:w-[480px]',
  lg: 'md:w-[540px]',
  xl: 'md:w-[560px]',
} as const

/** The desktop width axis. Mobile is always a full-width bottom sheet. */
export type ModalSize = keyof typeof modalWidths

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
  size?: ModalSize
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
   * focus on the close button: focusing a text field there throws the on-screen
   * keyboard over the sheet the user was trying to read.
   */
  autoFocusRef?: RefObject<HTMLElement | null>
}

/**
 * The app's modal: a bottom sheet on mobile, a centered card on desktop, with
 * a header, a scrolling body and an optional footer.
 *
 * Built on Radix Dialog, which is what supplies the focus trap, scroll lock,
 * `aria-modal` wiring and focus restore — the parts that are invisible until
 * they're missing. The mobile/desktop split is done in CSS (`md:`) rather than
 * by branching on a media query in JS, so there's one DOM tree: no wrong-shape
 * first paint, and no remount (losing focus and scroll position) when the
 * viewport crosses the breakpoint.
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
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Radix funnels Escape, the overlay and Dialog.Close through here, so
        // one guard covers every dismissal path.
        if (busy) return
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm',
            dialogOverlayAnimation
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            const target = autoFocusRef?.current
            if (!target || !window.matchMedia(DESKTOP_QUERY).matches) return
            // Read at open time, not render time: a media query resolved
            // during render is false on the first paint, which is exactly
            // when this decision gets made.
            event.preventDefault()
            target.focus()
          }}
          className={cn(
            'fixed z-50 focus:outline-none',
            dialogContentAnimation,
            // The inset resets are longhand on purpose — mixing the
            // `inset`/`inset-x` shorthand with `left`/`top` at one breakpoint
            // clobbers positioning, which strands the panel in the top-left
            // corner on desktop.
            'md:left-1/2 md:top-1/2 md:right-auto md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-[calc(100vw-2rem)]',
            'inset-x-0 bottom-0 w-full',
            modalWidths[size]
          )}
        >
          <div
            className={cn(
              'flex max-h-[88dvh] flex-col overflow-hidden rounded-t-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:max-h-[calc(100vh-4rem)] md:rounded-card',
              tall && 'min-h-[70dvh] md:min-h-[520px]'
            )}
          >
            <div className="flex justify-center pb-1 pt-2 md:hidden">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>

            <div
              className={cn(
                'flex items-start justify-between gap-3 px-5 pb-3 pt-3 md:pt-4',
                divided && 'border-b border-border'
              )}
            >
              <div className="min-w-0">
                {eyebrow && (
                  <SectionLabel tone="primary">{eyebrow}</SectionLabel>
                )}
                <Dialog.Title className="text-lg font-semibold text-text-primary">
                  {title}
                </Dialog.Title>
                {subtitle && (
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {subtitle}
                  </p>
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
