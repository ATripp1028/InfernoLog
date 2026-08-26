// A sliding panel that animates with a spring instead of a CSS keyframe.
//
// The Radix `Sheet` in ./sheet.tsx is the older one, and pages/List.tsx already
// notes that its "CSS keyframe transition reads noticeably less smooth". Two
// things are behind that, and only one of them is the easing:
//
//   • Radix's Dialog is modal by default, so opening it runs react-remove-scroll
//     over the body — `overflow: hidden` plus a scrollbar-width `padding-right`.
//     That relays out the whole page underneath on the exact frame the panel
//     starts moving, which is what the stutter actually is. The taller the page
//     behind it, the worse it reads.
//   • A keyframe cannot be interrupted. A spring can, so a sheet closed
//     mid-open follows the pointer rather than snapping.
//
// This deliberately does NOT lock body scroll, for the reason above —
// MobileActionSheet, the app's other spring sheet, does the same. The backdrop
// takes the clicks, so the page behind is inert even though it can still be
// scrolled.

import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Which edge the panel slides in from. */
export type MotionSheetSide = 'right' | 'bottom'

const PANEL_CLASSES: Record<MotionSheetSide, string> = {
  right:
    'inset-y-0 right-0 h-full w-[340px] max-w-[90vw] border-l border-border-subtle',
  bottom:
    'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-border-subtle',
}

// Offscreen resting position per side. Animating a transform (not `left`/`top`)
// is what keeps the movement on the compositor.
const HIDDEN: Record<MotionSheetSide, { x?: string; y?: string }> = {
  right: { x: '100%' },
  bottom: { y: '100%' },
}

const SHOWN: Record<MotionSheetSide, { x?: number; y?: number }> = {
  right: { x: 0 },
  bottom: { y: 0 },
}

/**
 * A spring-animated sheet.
 *
 * @param label - Names the dialog for screen readers. Required, because the
 * panel is `role="dialog"` and an unnamed dialog is announced as nothing.
 * @param side - Which edge it slides from. Callers pick per breakpoint.
 * @param onClose - Called by the backdrop, the Escape key, and anything inside
 * that asks to dismiss.
 */
export function MotionSheet({
  open,
  onClose,
  side = 'right',
  label,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  side?: MotionSheetSide
  label: string
  children: ReactNode
  className?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Where focus was before the sheet opened, so closing puts it back on the
  // control that opened it rather than at the top of the document.
  const restoreRef = useRef<HTMLElement | null>(null)
  // Callers pass `onClose` as an inline arrow, so it is a new function on every
  // render. Held in a ref rather than listed as a dependency below: an effect
  // that re-ran on it would run its cleanup — which restores focus to the
  // trigger — on every re-render of the page behind an open sheet, yanking
  // focus out of whatever the user was using inside it.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      restoreRef.current?.focus?.()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label={`Close ${label}`}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            initial={HIDDEN[side]}
            animate={SHOWN[side]}
            exit={HIDDEN[side]}
            transition={{ type: 'spring', damping: 34, stiffness: 320 }}
            className={cn(
              'fixed z-50 flex flex-col bg-bg-surface shadow-xl outline-none',
              PANEL_CLASSES[side],
              className
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
