import { forwardRef } from 'react'
import { Search, PanelRight } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface UnplacedPanelProps {
  count: number
  search: string
  onSearch: (v: string) => void
  isOver?: boolean
  children: React.ReactNode
}

// Presentational shell for the Unplaced side panel (and the mobile sheet). The
// droppable ref + over-state are wired by the board; the panel itself is
// layout-only so it can be reused outside the DnD context.
export const UnplacedPanel = forwardRef<HTMLDivElement, UnplacedPanelProps>(
  ({ count, search, onSearch, isOver, children }, ref) => (
    <div
      ref={ref}
      className={[
        'flex h-full flex-col rounded-card border bg-[var(--color-bg-surface)]',
        isOver
          ? 'border-[var(--color-primary)]'
          : 'border-[var(--color-border-subtle)]',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] px-3 py-3">
        <PanelRight className="size-4 text-text-secondary" />
        <span className="text-sm font-semibold text-text-primary">
          Unplaced
        </span>
        <span className="ml-1 text-sm text-text-tertiary">{count}</span>
      </div>
      <div className="p-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search unplaced…"
            className="h-9 pl-9"
          />
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {children}
      </div>
    </div>
  )
)
UnplacedPanel.displayName = 'UnplacedPanel'
