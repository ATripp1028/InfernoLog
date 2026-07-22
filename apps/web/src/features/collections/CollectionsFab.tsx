// Context-scoped FAB for the collections pages (replaces the logging FAB
// there — FabMenu bows out on /collections routes):
//   • index  → create-direct: the FAB opens the create modal
//   • detail → menu: Add levels / Edit / Delete (built-ins drop Edit/Delete)
// Desktop renders a hover speed dial (DesktopHoverFab); on mobile the shared
// bottom-bar FAB is overridden via MobileFabContext and the menu renders as
// a bottom sheet (mock 1257:2).

import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMobileFabContext } from '@/context/MobileFabContext'
import { cn } from '@/lib/utils'
import { DesktopHoverFab, type HoverFabAction } from '@/components/DesktopHoverFab'
import { MobileActionSheet } from '@/components/MobileActionSheet'
import { useMe } from '@/lib/api/me'

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
  const me = useMe()
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

  // The mobile sheet has its own backdrop to close on outside-click; this
  // just adds Escape support while it's open.
  useEffect(() => {
    if (!menuOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  function activate(action: CollectionFabAction) {
    setMenuOpen(false)
    action.onSelect()
  }

  // Every caller passes at least one action.
  const primaryAction = actions[0]!
  const primary: HoverFabAction = {
    key: primaryAction.key,
    label: primaryAction.label,
    icon: primaryAction.icon,
    onClick: primaryAction.onSelect,
  }
  // Rendered farthest-from-FAB first: delete (when present) ends up
  // furthest away, edit nearest.
  const secondaryActions: HoverFabAction[] = actions
    .slice(1)
    .reverse()
    .map((action) => ({
      key: action.key,
      label: action.label,
      icon: action.icon,
      danger: action.danger,
      onClick: action.onSelect,
    }))

  return (
    <>
      <DesktopHoverFab
        primary={primary}
        secondaryActions={secondaryActions}
        groupAriaLabel={isMenu ? 'Collection actions' : primary.label}
        className="fixed bottom-6 right-6 z-20"
        autoExpandLabels={me.data?.autoExpandFabLabels ?? true}
      />

      {/* Mobile menu — bottom sheet above the nav bar */}
      <div className="md:hidden">
        <MobileActionSheet
          open={menuOpen && isMenu}
          onClose={() => setMenuOpen(false)}
          ariaLabel="Collection actions"
        >
          {/* Desktop stacks these bottom-to-top with actions[0] as the FAB
              itself, so top-to-bottom reads delete, edit, actions[0].
              Mirror that order here. */}
          <ul className="flex flex-col gap-1 px-2 py-2">
            {[...actions].reverse().map((action) => (
              <li key={action.key}>
                <MenuItem
                  action={action}
                  onClick={() => activate(action)}
                  tall
                />
              </li>
            ))}
          </ul>
        </MobileActionSheet>
      </div>
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
