import { useState, type ReactNode } from 'react'
import { useLoggingFlow } from './LoggingFlowProvider'
import { LOGGING_ACTIONS } from './loggingActions'
import type { FabAction } from '@/context/FabActionsContext'
import { AddToWantToBeatDialog } from '@/features/collections/AddToWantToBeatDialog'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'

// The FAB's default action set — shown on any page that doesn't register
// its own actions via useFabActions (List, Ranking, etc). Called
// independently by the desktop Fab and MobileNav, each getting its own
// dialog state — the two breakpoints are never both visible at once.
export function useDefaultFabActions(): {
  actions: FabAction[]
  dialogs: ReactNode
} {
  const { open } = useLoggingFlow()
  const [wtbOpen, setWtbOpen] = useState(false)
  const [addColOpen, setAddColOpen] = useState(false)

  const actions: FabAction[] = LOGGING_ACTIONS.map((action) => ({
    key: action.key,
    label: action.label,
    icon: action.icon,
    disabled: action.disabled,
    onClick: () => {
      if (action.path) open(action.path)
      else if (action.key === 'want-to-beat') setWtbOpen(true)
      else if (action.key === 'add-to-list') setAddColOpen(true)
    },
  }))

  const dialogs = (
    <>
      <AddToWantToBeatDialog open={wtbOpen} onClose={() => setWtbOpen(false)} />
      <AddToCollectionDialog
        open={addColOpen}
        onClose={() => setAddColOpen(false)}
      />
    </>
  )

  return { actions, dialogs }
}
