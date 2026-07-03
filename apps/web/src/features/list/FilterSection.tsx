import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// A collapsible filter section: header row with a chevron, content below.
export function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[var(--color-border-subtle)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between px-4 text-xs font-semibold text-text-secondary"
      >
        {title}
        <ChevronDown
          size={14}
          className={cn(
            'text-text-tertiary transition-transform',
            !open && '-rotate-90'
          )}
        />
      </button>
      {open && <div className="pb-3 pt-1">{children}</div>}
    </div>
  )
}
