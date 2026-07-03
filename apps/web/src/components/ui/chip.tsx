import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

// A toggle pill used by the List filter panel (progress, list source, level
// type, rating status, status flags). Selected = solid primary fill; unselected
// = subtle outlined. Render as a button so it's keyboard-accessible.
interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected = false, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'bg-[var(--color-primary)] text-white'
          : 'border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-text-secondary hover:text-text-primary',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
)
Chip.displayName = 'Chip'
