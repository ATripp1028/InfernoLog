import { useState, type ReactNode } from 'react'
import { useLoggingFlow } from './LoggingFlowContext'
import { LOGGING_ACTIONS } from '@/features/logging/loggingActions'
import type { FabAction } from './FabActionsContext'
import { AddToWantToBeatDialog } from '@/features/collections/AddToWantToBeatDialog'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'

/**
 * The FAB's default action set — shown on any page that doesn't register
 * its own actions via useFabActions (List, Ranking, etc).
 *
 * Lives beside {@link FabActionsContext}, its only caller, rather than in
 * `features/logging`: the set spans two features (three logging paths plus
 * the two collection dialogs) and belongs to the app chrome, not to either
 * of them. The dialog state is per-hook-instance rather than shared, so a
 * second caller would get its own — today `FabActionsProvider` is the only
 * one, and it renders the returned `dialogs` once for both breakpoints.
 */
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
