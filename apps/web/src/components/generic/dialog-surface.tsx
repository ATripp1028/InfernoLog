import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode, RefObject } from 'react'
import { cn } from '@/lib/utils'
import {
  dialogContentAnimation,
  dialogOverlayAnimation,
} from '@/lib/dialogAnimation'

// The breakpoint every dialog switches shape at. Kept here rather than passed
// in: a dialog that becomes a bottom sheet at a different width than its
// siblings is a bug, not a feature.
const DESKTOP_QUERY = '(min-width: 768px)'

// Desktop widths. Named rather than free-form so call sites pick from a set
// instead of inventing a fifth width that's 8px off one of these.
const surfaceWidths = {
  sm: 'md:w-[384px]',
  md: 'md:w-[480px]',
  lg: 'md:w-[540px]',
  xl: 'md:w-[560px]',
} as const

/** The desktop width axis. Mobile is always a full-width bottom sheet. */
export type DialogSize = keyof typeof surfaceWidths

/**
 * Props for {@link DialogSurface}.
 */
export interface DialogSurfaceProps {
  open: boolean
  /** Called for every dismissal Radix recognises — Escape, overlay, Close. */
  onDismiss: () => void
  /**
   * A write the user hasn't seen the result of yet. Seals the dialog: Escape,
   * the overlay and any `Dialog.Close` inside all stop working. Pass writes
   * only — blocking on a search would trap the user behind a slow network for
   * no gain. Controls that dismiss must be disabled by the caller to match.
   */
  busy?: boolean
  size?: DialogSize
  /** Layout for the panel — its padding, or its flex/height behaviour. */
  className?: string
  /**
   * True when the content renders a `Dialog.Description`. Radix wires
   * `aria-describedby` to it when it exists and warns when the attribute
   * points at nothing, so the surface has to be told which case it is in.
   */
  hasDescription?: boolean
  /**
   * Focused when the dialog opens, on desktop only. Mobile deliberately keeps
   * focus where Radix puts it: focusing a text field there throws the
   * on-screen keyboard over the panel the user was trying to read.
   */
  autoFocusRef?: RefObject<HTMLElement | null> | undefined
  children: ReactNode
}

/**
 * The chrome under every dialog in the app: the Radix root, the overlay, the
 * positioned panel, the open/close animation, the mobile drag handle, and the
 * rule that a dialog mid-write can't be dismissed.
 *
 * It deliberately has no opinion about what goes *inside* the panel. Two
 * anatomies sit on top of it and disagree completely there — {@link Modal}
 * (header, scrolling body, footer) and {@link AlertDialog} (title,
 * description, actions) — so everything they share stops at this boundary and
 * everything they don't is theirs. Reach for one of those two rather than this
 * directly; a third anatomy is a sign the question needs a different answer.
 *
 * Mobile/desktop is a CSS split (`md:`), not a JS media query, so there is one
 * DOM tree: no wrong-shape first paint, and no remount — losing focus and
 * scroll position — when the viewport crosses the breakpoint.
 */
export function DialogSurface({
  open,
  onDismiss,
  busy = false,
  size = 'lg',
  className,
  hasDescription = false,
  autoFocusRef,
  children,
}: DialogSurfaceProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Radix funnels Escape, the overlay and Dialog.Close through here, so
        // one guard covers every dismissal path.
        if (busy) return
        if (!next) onDismiss()
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
          {...(hasDescription ? {} : { 'aria-describedby': undefined })}
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
            surfaceWidths[size]
          )}
        >
          <div
            className={cn(
              'rounded-t-card border-t border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:rounded-card md:border',
              className
            )}
          >
            <div className="flex shrink-0 justify-center pb-1 pt-2 md:hidden">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
