import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MobileSheetDialogProps {
  onClose: () => void
  children: ReactNode
  // Lets each dialog keep its own surface/border tokens; the backdrop,
  // position, drag-handle, focus, and Escape handling are shared.
  className?: string
}

// Shared mobile bottom-sheet shell for form dialogs that also render a
// centered desktop modal (CollectionFormDialog, PresetCreateDialog). Unlike
// `MobileActionSheet` (nav-list menus), these need a header/scrollable-body/
// sticky-footer layout and a desktop fallback the caller supplies itself —
// this component owns only the mobile shell.
//
// Focuses the sheet itself on mount so Escape-to-close works: these dialogs
// intentionally skip `autoFocus` on their inputs on mobile (to avoid popping
// the keyboard immediately), so without this, keyboard focus stays on the
// trigger button outside the sheet's DOM subtree and Escape never bubbles in.
export function MobileSheetDialog({
  onClose,
  children,
  className,
}: MobileSheetDialogProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sheetRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        className={cn(
          'absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-card border-t shadow-[0_-8px_24px_rgba(0,0,0,0.5)] outline-none',
          className
        )}
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        {children}
      </div>
    </div>
  )
}
