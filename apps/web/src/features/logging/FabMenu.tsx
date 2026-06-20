import { useEffect, useRef, useState } from 'react'
import { Check, Flag, List, Plus, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLoggingFlow } from './LoggingFlowProvider'
import type { FlowPath } from './types'

// Desktop FAB + popover menu (Figma screen 01). The two list-related actions
// are deferred — shown but disabled — until those workflows are built.
export function FabMenu() {
  const { open } = useLoggingFlow()
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function start(path: FlowPath) {
    setMenuOpen(false)
    open(path)
  }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 right-6 z-20 hidden md:block"
    >
      {menuOpen && (
        <div
          role="menu"
          className="absolute bottom-16 right-0 w-64 overflow-hidden rounded-card border border-border bg-bg-elevated p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
        >
          <MenuItem
            icon={<Check size={16} />}
            label="Log a completion"
            highlight
            onClick={() => start('completion')}
          />
          <MenuItem
            icon={<Flag size={16} />}
            label="Log progress"
            onClick={() => start('progress')}
          />
          <MenuItem
            icon={<X size={16} />}
            label="Drop a level"
            onClick={() => start('drop')}
          />
          <div className="my-1.5 h-px bg-border-subtle" />
          <MenuItem
            icon={<Star size={16} />}
            label="Add to Want to Beat"
            disabled
          />
          <MenuItem icon={<List size={16} />} label="Add to a list" disabled />
        </div>
      )}

      <button
        type="button"
        aria-label="Add level"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        className="flex size-14 items-center justify-center rounded-fab bg-primary text-text-primary shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors hover:bg-primary-hover"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  highlight,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  highlight?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors',
        disabled && 'cursor-not-allowed text-text-tertiary',
        !disabled && highlight && 'bg-primary text-primary-foreground',
        !disabled && !highlight && 'text-text-primary hover:bg-bg-subtle'
      )}
    >
      <span
        className={cn(
          disabled
            ? 'text-text-tertiary'
            : highlight
              ? 'text-primary-foreground'
              : 'text-text-secondary'
        )}
      >
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}
