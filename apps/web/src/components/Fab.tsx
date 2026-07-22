import { Plus } from 'lucide-react'
import { DesktopHoverFab } from './DesktopHoverFab'
import { useFabActionsOverride } from '@/context/FabActionsContext'
import { useDefaultFabActions } from '@/features/logging/useDefaultFabActions'
import { useMe } from '@/lib/api/me'

// The one desktop FAB, mounted once in Shell. Renders whichever action set
// is currently registered via useFabActions (level-page owner actions,
// collections actions, ...), falling back to the default logging actions
// when no page has overridden it.
export function Fab() {
  const override = useFabActionsOverride()
  const me = useMe()
  const { actions: defaultActions, dialogs } = useDefaultFabActions()

  const actions = override ?? defaultActions
  // Every actions array (default or registered via useFabActions) has at
  // least one entry.
  const primary = actions[0]!
  // Farthest-from-FAB first — matches the authoring order (most
  // consequential/least-common action first).
  const secondaryActions = actions.slice(1).reverse()

  return (
    <>
      <DesktopHoverFab
        primary={primary}
        // A harmless no-op crossfade when primary.icon is already Plus (e.g.
        // "Add levels" / "New collection").
        restIcon={Plus}
        secondaryActions={secondaryActions}
        groupAriaLabel="Quick actions"
        className="fixed bottom-6 z-20 transition-[right] duration-200"
        style={{ right: 'calc(1.5rem + var(--fab-shift, 0px))' }}
        autoExpandLabels={me.data?.autoExpandFabLabels ?? true}
      />
      {dialogs}
    </>
  )
}
