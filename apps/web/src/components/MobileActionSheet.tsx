import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'

// Dragging the handle past this offset (or flicking it down fast enough)
// dismisses the sheet instead of springing back to rest.
const CLOSE_DRAG_OFFSET = 100
const CLOSE_DRAG_VELOCITY = 500

interface MobileActionSheetProps {
  open: boolean
  onClose: () => void
  ariaLabel?: string
  children: ReactNode
}

/**
 * Bottom sheet shared by the mobile action menus (MobileNav's Log/More
 * sheets, LevelFab, CollectionsFab): backdrop fade, slide-up-from-the-nav-bar
 * entrance, and a drag handle that can be pulled down to dismiss.
 */
export function MobileActionSheet({
  open,
  onClose,
  ariaLabel,
  children,
}: MobileActionSheetProps) {
  const dragControls = useDragControls()

  // Radix Dialog's `Sheet` (this component's predecessor for some of these
  // menus) closed on Escape for free; this plain framer-motion sheet doesn't
  // get that automatically, so wire it up directly at the document level —
  // content here is arbitrary (nav links, form controls), not a single
  // focused element we can rely on to bubble a local keydown handler.
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="fixed inset-0 z-30 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            role="menu"
            aria-label={ariaLabel}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={(_, info) => {
              if (
                info.offset.y > CLOSE_DRAG_OFFSET ||
                info.velocity.y > CLOSE_DRAG_VELOCITY
              ) {
                onClose()
              }
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            className="fixed inset-x-0 bottom-[72px] z-40 rounded-t-card border-t border-border-subtle bg-bg-elevated shadow-[0_-8px_24px_rgba(0,0,0,0.5)]"
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex touch-none justify-center pb-1 pt-2 active:cursor-grabbing"
            >
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
