import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
}

/**
 * Mobile-only collapsible section: a full-bleed 44px header (13px white label,
 * the sibling's mobile convention) with a ▾/▸ chevron, separated from the
 * section above by the parent's 1px rule. Desktop has no collapse at all.
 *
 * State is intentionally local and defaults to open, so it does NOT persist —
 * a fresh mount (i.e. revisiting the page) resets every section to expanded.
 */
export function CollapsibleSection({
  title,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(true)

  return (
    <section className="border-t border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between px-4 text-left"
      >
        <span className="text-[13px] font-medium text-text-primary">
          {title}
        </span>
        {open ? (
          <ChevronDown size={18} className="text-text-tertiary" aria-hidden />
        ) : (
          <ChevronRight size={18} className="text-text-tertiary" aria-hidden />
        )}
      </button>
      {open && <div className="px-4 pb-5">{children}</div>}
    </section>
  )
}

/**
 * Desktop counterpart to CollapsibleSection's header: small uppercase grey,
 * the desktop convention (mobile uses the 13px white label above instead).
 * Desktop sections never collapse, so this is a header, not a wrapper.
 */
export function DesktopSectionHeader({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
      {children}
    </h2>
  )
}
