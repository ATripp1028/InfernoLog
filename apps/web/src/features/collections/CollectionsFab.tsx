// Context-scoped FAB for the collections pages (replaces the logging FAB
// there — FabMenu bows out on /collections routes):
//   • index  → create-direct: the FAB opens the create modal
//   • detail → menu: Add levels / Edit / Delete (built-ins drop Edit/Delete)
// Desktop renders the fixed bottom-right FAB + popover menu (mock 1211:2);
// on mobile the shared bottom-bar FAB is overridden via MobileFabContext and
// the menu renders as a bottom sheet (mock 1257:2).

import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMobileFabContext } from '@/context/MobileFabContext'
import { cn } from '@/lib/utils'

export interface CollectionFabAction {
  key: string
  label: string
  icon: typeof Plus
  danger?: boolean
  highlight?: boolean
  onSelect: () => void
}

export function collectionDetailActions(opts: {
  isCustom: boolean
  onAddLevels: () => void
  onEdit: () => void
  onDelete: () => void
}): CollectionFabAction[] {
  const actions: CollectionFabAction[] = [
    {
      key: 'add',
      label: 'Add levels',
      icon: Plus,
      highlight: true,
      onSelect: opts.onAddLevels,
    },
  ]
  if (opts.isCustom) {
    actions.push(
      {
        key: 'edit',
        label: 'Edit collection',
        icon: Pencil,
        onSelect: opts.onEdit,
      },
      {
        key: 'delete',
        label: 'Delete collection',
        icon: Trash2,
        danger: true,
        onSelect: opts.onDelete,
      }
    )
  }
  return actions
}

interface CollectionsFabProps {
  // Single action → the FAB triggers it directly (index create-direct).
  // Multiple → the FAB toggles a menu (detail).
  actions: CollectionFabAction[]
}

export function CollectionsFab({ actions }: CollectionsFabProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { setOverrideToggle } = useMobileFabContext()
  const isMenu = actions.length > 1

  // Take over the mobile bottom-bar FAB while mounted.
  useEffect(() => {
    setOverrideToggle(() => {
      if (isMenu) setMenuOpen((v) => !v)
      else actions[0]?.onSelect()
    })
    return () => setOverrideToggle(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOverrideToggle, isMenu, actions.map((a) => a.key).join()])

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

  function activate(action: CollectionFabAction) {
    setMenuOpen(false)
    action.onSelect()
  }

  return (
    <>
      {/* Desktop FAB + popover menu */}
      <div
        ref={containerRef}
        className="fixed bottom-6 right-6 z-20 hidden md:block"
      >
        {menuOpen && isMenu && (
          <div
            role="menu"
            className="absolute bottom-16 right-0 w-60 overflow-hidden rounded-[10px] border border-border bg-bg-elevated p-2 shadow-[0_6px_20px_rgba(0,0,0,0.5)]"
          >
            {actions.map((action, i) => (
              <div key={action.key}>
                {i === 1 && <div className="my-1 h-px bg-border" />}
                <MenuItem action={action} onClick={() => activate(action)} />
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          aria-label={isMenu ? 'Collection actions' : actions[0]?.label}
          aria-haspopup={isMenu ? 'menu' : undefined}
          aria-expanded={isMenu ? menuOpen : undefined}
          onClick={() => {
            if (isMenu) setMenuOpen((v) => !v)
            else actions[0]?.onSelect()
          }}
          className="flex size-14 items-center justify-center rounded-fab bg-primary text-text-primary shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors hover:bg-primary-hover"
        >
          {menuOpen && isMenu ? (
            <X size={24} strokeWidth={2.5} />
          ) : (
            <Plus size={24} strokeWidth={2.5} />
          )}
        </button>
      </div>

      {/* Mobile menu — bottom sheet above the nav bar */}
      {menuOpen && isMenu && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/40"
          />
          <div className="fixed inset-x-0 bottom-[72px] z-40 rounded-t-card border-t border-border-subtle bg-bg-elevated shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
            <div className="flex justify-center pb-1 pt-2">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>
            <ul className="flex flex-col gap-1 px-2 py-2">
              {actions.map((action) => (
                <li key={action.key}>
                  <MenuItem
                    action={action}
                    onClick={() => activate(action)}
                    tall
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}

function MenuItem({
  action,
  onClick,
  tall = false,
}: {
  action: CollectionFabAction
  onClick: () => void
  tall?: boolean
}) {
  const Icon = action.icon
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors',
        tall ? 'h-12' : 'h-10',
        action.danger
          ? 'text-red-500 hover:bg-red-500/10'
          : 'text-text-primary hover:bg-bg-subtle'
      )}
    >
      <Icon
        size={16}
        className={cn(
          action.danger
            ? 'text-red-500'
            : action.highlight
              ? 'text-primary'
              : 'text-text-secondary'
        )}
      />
      <span className={cn(action.highlight && 'font-semibold')}>
        {action.label}
      </span>
    </button>
  )
}
