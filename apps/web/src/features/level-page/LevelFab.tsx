import { useRef, useState, useEffect } from 'react'
import { List, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobileFabContext } from '@/context/MobileFabContext'

// Level-page-specific FAB for owned entries.
// Desktop: anchored popover (small menu above the FAB).
// Mobile: bottom sheet above the bottom nav.
//
// Both patterns overlay the global FabMenu at higher z-index.
// "Add to a list" is shown disabled — the workflow isn't built yet.

interface FabProps {
  onEdit: () => void
  onDelete: () => void
  onGddlSubmit?: () => void
}

type ActionKey = 'edit' | 'add-list' | 'gddl-submit' | 'delete'

interface FabAction {
  key: ActionKey
  label: string
  icon: React.ComponentType<{ size?: number }>
  danger?: boolean
  disabled?: boolean
}

function buildActions(onGddlSubmit?: () => void): FabAction[] {
  const actions: FabAction[] = [
    { key: 'edit', label: 'Edit this entry', icon: Pencil },
    { key: 'add-list', label: 'Add to a list', icon: List, disabled: true },
  ]
  if (onGddlSubmit) {
    actions.push({ key: 'gddl-submit', label: 'Submit to GDDL', icon: Upload })
  }
  actions.push({
    key: 'delete',
    label: 'Delete this level',
    icon: Trash2,
    danger: true,
  })
  return actions
}

// ─── Desktop popover ───────────────────────────────────────────────
function DesktopFab({ onEdit, onDelete, onGddlSubmit }: FabProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const actions = buildActions(onGddlSubmit)

  function handleAction(key: ActionKey) {
    setOpen(false)
    if (key === 'edit') onEdit()
    if (key === 'delete') onDelete()
    if (key === 'gddl-submit') onGddlSubmit?.()
  }

  return (
    <div
      ref={ref}
      // z-30 sits above the global FabMenu (z-20)
      className="fixed bottom-6 right-6 z-30 hidden md:block"
    >
      {open && (
        <div
          role="menu"
          className="absolute bottom-16 right-0 w-52 overflow-hidden rounded-card border border-border bg-bg-elevated p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
        >
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => !action.disabled && handleAction(action.key)}
                className={cn(
                  'flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors',
                  action.disabled && 'cursor-not-allowed text-text-tertiary',
                  !action.disabled &&
                    action.danger &&
                    'text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]',
                  !action.disabled &&
                    !action.danger &&
                    'text-text-primary hover:bg-bg-subtle'
                )}
              >
                <Icon size={16} />
                <span>{action.label}</span>
                {action.disabled && (
                  <span className="ml-auto text-[10px] text-text-tertiary">
                    soon
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <button
        type="button"
        aria-label="Level actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-14 items-center justify-center rounded-fab bg-primary text-text-primary shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors hover:bg-primary-hover"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  )
}

// ─── Mobile bottom sheet ───────────────────────────────────────────
// No floating button — registers a toggle into MobileFabContext so the
// nav bar's center FAB slot drives this sheet instead of the logging menu.
function MobileFab({ onEdit, onDelete, onGddlSubmit }: FabProps) {
  const [open, setOpen] = useState(false)
  const { setOverrideToggle } = useMobileFabContext()

  useEffect(() => {
    setOverrideToggle(() => setOpen((v) => !v))
    return () => setOverrideToggle(null)
  }, [setOverrideToggle])

  const actions = buildActions(onGddlSubmit)

  function handleAction(key: ActionKey) {
    setOpen(false)
    if (key === 'edit') onEdit()
    if (key === 'delete') onDelete()
    if (key === 'gddl-submit') onGddlSubmit?.()
  }

  if (!open) return null

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <div className="fixed inset-x-0 bottom-[72px] z-50 rounded-t-card border-t border-border-subtle bg-bg-elevated shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
        <div className="flex justify-center pb-1 pt-2">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        <ul className="flex flex-col gap-1 px-2 py-2">
          {actions.map((action) => {
            const Icon = action.icon
            if (action.disabled) {
              return (
                <li key={action.key}>
                  <div className="flex h-12 items-center gap-3 rounded-btn px-3 text-text-tertiary opacity-70">
                    <Icon size={20} />
                    <span className="text-sm font-medium">{action.label}</span>
                  </div>
                </li>
              )
            }
            return (
              <li key={action.key}>
                <button
                  type="button"
                  onClick={() => handleAction(action.key)}
                  className={cn(
                    'flex h-12 w-full items-center gap-3 rounded-btn px-3 text-left text-sm font-medium transition-colors',
                    action.danger
                      ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]'
                      : 'text-text-primary hover:bg-bg-subtle'
                  )}
                >
                  <Icon size={20} />
                  <span>{action.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ─── Public export ─────────────────────────────────────────────────
export function LevelFab({ onEdit, onDelete, onGddlSubmit }: FabProps) {
  const gddlProp = onGddlSubmit ? { onGddlSubmit } : {}
  return (
    <>
      <DesktopFab onEdit={onEdit} onDelete={onDelete} {...gddlProp} />
      <MobileFab onEdit={onEdit} onDelete={onDelete} {...gddlProp} />
    </>
  )
}
