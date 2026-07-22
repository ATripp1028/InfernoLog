import { useState, useEffect } from 'react'
import { List, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobileFabContext } from '@/context/MobileFabContext'
import { DesktopHoverFab, type HoverFabAction } from '@/components/DesktopHoverFab'
import { MobileActionSheet } from '@/components/MobileActionSheet'
import { useMe } from '@/lib/api/me'

// Level-page-specific FAB for owned entries.
// Desktop: hover speed dial (DesktopHoverFab).
// Mobile: bottom sheet above the bottom nav.
//
// Both patterns overlay the global FabMenu at higher z-index.

interface FabProps {
  onEdit: () => void
  onDelete: () => void
  onGddlSubmit?: () => void
  onAddToCollection?: () => void
}

type ActionKey = 'edit' | 'add-collection' | 'gddl-submit' | 'delete'

interface FabAction {
  key: ActionKey
  label: string
  icon: React.ComponentType<{ size?: number }>
  danger?: boolean
  disabled?: boolean
}

function buildActions(
  onGddlSubmit?: () => void,
  onAddToCollection?: () => void
): FabAction[] {
  const actions: FabAction[] = [
    { key: 'edit', label: 'Edit this entry', icon: Pencil },
    {
      key: 'add-collection',
      label: 'Add to a Collection',
      icon: List,
      disabled: !onAddToCollection,
    },
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

// ─── Desktop speed dial ─────────────────────────────────────────────
// "Edit" is the primary action (the FAB itself); the rest fan out above it
// on hover. Delete is listed farthest from the FAB — the destructive action
// should be the hardest to reach by accident.
function DesktopFab({
  onEdit,
  onDelete,
  onGddlSubmit,
  onAddToCollection,
}: FabProps) {
  const me = useMe()
  const primary: HoverFabAction = {
    key: 'edit',
    label: 'Edit this entry',
    icon: Pencil,
    onClick: onEdit,
  }

  const secondaryActions: HoverFabAction[] = [
    { key: 'delete', label: 'Delete this level', icon: Trash2, danger: true, onClick: onDelete },
    ...(onGddlSubmit
      ? [
          {
            key: 'gddl-submit',
            label: 'Submit to GDDL',
            icon: Upload,
            onClick: onGddlSubmit,
          },
        ]
      : []),
    {
      key: 'add-collection',
      label: 'Add to a Collection',
      icon: List,
      onClick: onAddToCollection ?? (() => {}),
      disabled: !onAddToCollection,
    },
  ]

  return (
    <DesktopHoverFab
      primary={primary}
      restIcon={Plus}
      secondaryActions={secondaryActions}
      groupAriaLabel="Level actions"
      // z-30 sits above the global FabMenu (z-20)
      className="fixed bottom-6 right-6 z-30"
      autoExpandLabels={me.data?.autoExpandFabLabels ?? true}
    />
  )
}

// ─── Mobile bottom sheet ───────────────────────────────────────────
// No floating button — registers a toggle into MobileFabContext so the
// nav bar's center FAB slot drives this sheet instead of the logging menu.
function MobileFab({
  onEdit,
  onDelete,
  onGddlSubmit,
  onAddToCollection,
}: FabProps) {
  const [open, setOpen] = useState(false)
  const { setOverrideToggle } = useMobileFabContext()

  useEffect(() => {
    setOverrideToggle(() => setOpen((v) => !v))
    return () => setOverrideToggle(null)
  }, [setOverrideToggle])

  // Desktop stacks these bottom-to-top with edit as the FAB itself, so
  // top-to-bottom reads delete, gddl-submit, add-collection, edit. Mirror
  // that order in the mobile sheet.
  const actions = [...buildActions(onGddlSubmit, onAddToCollection)].reverse()

  function handleAction(key: ActionKey) {
    setOpen(false)
    if (key === 'edit') onEdit()
    if (key === 'delete') onDelete()
    if (key === 'gddl-submit') onGddlSubmit?.()
    if (key === 'add-collection') onAddToCollection?.()
  }

  return (
    <div className="md:hidden">
      <MobileActionSheet
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Level actions"
      >
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
      </MobileActionSheet>
    </div>
  )
}

// ─── Public export ─────────────────────────────────────────────────
export function LevelFab({
  onEdit,
  onDelete,
  onGddlSubmit,
  onAddToCollection,
}: FabProps) {
  const extra = {
    ...(onGddlSubmit ? { onGddlSubmit } : {}),
    ...(onAddToCollection ? { onAddToCollection } : {}),
  }
  return (
    <>
      <DesktopFab onEdit={onEdit} onDelete={onDelete} {...extra} />
      <MobileFab onEdit={onEdit} onDelete={onDelete} {...extra} />
    </>
  )
}
