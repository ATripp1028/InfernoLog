import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLoggingFlow } from './LoggingFlowProvider'
import { LOGGING_ACTIONS, type LoggingAction } from './loggingActions'
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
      className="fixed bottom-6 z-20 hidden transition-[right] duration-200 md:block"
      // Shifts left of the List page's docked filter panel when open (the page
      // sets --fab-shift; it defaults to 0 everywhere else).
      style={{ right: 'calc(1.5rem + var(--fab-shift, 0px))' }}
    >
      {menuOpen && (
        <div
          role="menu"
          className="absolute bottom-16 right-0 w-64 overflow-hidden rounded-card border border-border bg-bg-elevated p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
        >
          {LOGGING_ACTIONS.map((action, i) => {
            const prev = LOGGING_ACTIONS[i - 1]
            const divider = action.disabled && prev && !prev.disabled
            return (
              <div key={action.key}>
                {divider && <div className="my-1.5 h-px bg-border-subtle" />}
                <MenuItem
                  action={action}
                  onClick={action.path ? () => start(action.path!) : undefined}
                />
              </div>
            )
          })}
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
  action,
  onClick,
}: {
  action: LoggingAction
  onClick?: (() => void) | undefined
}) {
  const { label, icon: Icon, highlight, disabled } = action
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
        <Icon size={16} />
      </span>
      <span>{label}</span>
    </button>
  )
}
