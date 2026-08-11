import { AnimatePresence, motion } from 'framer-motion'
import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterTabProps {
  open: boolean
  onToggle: () => void
  activeCount: number
}

/**
 * Rendered inline as the last item in the Toolbar's trailing button cluster
 * — not fixed/absolutely positioned. The negative right margin cancels the
 * content column's own right padding (List.tsx's p-4/md:p-6), so the tab's
 * right edge pokes out to the column's true outer edge: the viewport edge
 * when the filter panel is closed, or the seam with the now-open panel once
 * it pushes the column narrower. That means the tab "moves" for free as
 * part of the normal reflow — no repositioning logic needed — ending up
 * looking like it's attached to the panel's edge once it's open.
 */
export function FilterTab({ open, onToggle, activeCount }: FilterTabProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Close filters' : 'Filters'}
      aria-expanded={open}
      className={cn(
        'relative -mr-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-l-xl border border-r-0 border-border-subtle bg-bg-surface text-text-secondary transition-colors hover:text-text-primary md:-mr-6',
        !open && 'shadow-[-4px_4px_16px_rgba(0,0,0,0.3)]'
      )}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={open ? 'close' : 'open'}
          initial={{ opacity: 0, rotate: -45 }}
          animate={{ opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, rotate: 45 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center"
        >
          {open ? <X size={18} /> : <SlidersHorizontal size={16} />}
        </motion.span>
      </AnimatePresence>
      {activeCount > 0 && !open && (
        <span className="absolute -left-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
          {activeCount}
        </span>
      )}
    </button>
  )
}
