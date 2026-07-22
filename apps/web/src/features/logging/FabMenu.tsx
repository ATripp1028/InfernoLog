import { useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { DesktopHoverFab, type HoverFabAction } from '@/components/DesktopHoverFab'
import { useLoggingFlow } from './LoggingFlowProvider'
import { LOGGING_ACTIONS, type LoggingAction } from './loggingActions'
import { AddToWantToBeatDialog } from '@/features/collections/AddToWantToBeatDialog'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'

const PRIMARY_ACTION = LOGGING_ACTIONS.find((a) => a.highlight)!
// Rendered nearest-to-FAB first, so the stack fans out upward in this order.
const SECONDARY_ACTIONS = [...LOGGING_ACTIONS]
  .filter((a) => a !== PRIMARY_ACTION)
  .reverse()

// Desktop FAB: a hover-activated speed dial (see DesktopHoverFab).
export function FabMenu() {
  const { open } = useLoggingFlow()
  const [wtbOpen, setWtbOpen] = useState(false)
  const [addColOpen, setAddColOpen] = useState(false)
  const location = useLocation()
  // The collections pages render their own context-scoped FAB.
  const suppressed = location.pathname.startsWith('/collections')

  function getOnClick(action: LoggingAction): () => void {
    if (action.path) return () => open(action.path!)
    if (action.key === 'want-to-beat') return () => setWtbOpen(true)
    if (action.key === 'add-to-list') return () => setAddColOpen(true)
    return () => {}
  }

  const primary: HoverFabAction = {
    key: PRIMARY_ACTION.key,
    label: PRIMARY_ACTION.label,
    icon: PRIMARY_ACTION.icon,
    onClick: getOnClick(PRIMARY_ACTION),
  }

  const secondaryActions: HoverFabAction[] = SECONDARY_ACTIONS.map(
    (action) => ({
      key: action.key,
      label: action.label,
      icon: action.icon,
      disabled: action.disabled,
      onClick: getOnClick(action),
    })
  )

  return (
    <>
      {!suppressed && (
        <DesktopHoverFab
          primary={primary}
          restIcon={Plus}
          secondaryActions={secondaryActions}
          groupAriaLabel="Log actions"
          className="fixed bottom-6 z-20 transition-[right] duration-200"
          style={{ right: 'calc(1.5rem + var(--fab-shift, 0px))' }}
        />
      )}
      <AddToWantToBeatDialog open={wtbOpen} onClose={() => setWtbOpen(false)} />
      <AddToCollectionDialog
        open={addColOpen}
        onClose={() => setAddColOpen(false)}
      />
    </>
  )
}
