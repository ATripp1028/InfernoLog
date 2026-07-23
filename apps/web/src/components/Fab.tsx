import { Plus } from 'lucide-react'
import { DesktopHoverFab } from './DesktopHoverFab'
import { useResolvedFabActions } from '@/context/FabActionsContext'
import { useMe } from '@/lib/api/me'

// The one desktop FAB, mounted once in Shell. Renders whichever action set
// is currently registered via useFabActions (level-page owner actions,
// collections actions, ...), falling back to the default logging actions
// when no page has overridden it.
export function Fab() {
  const { primary, secondaryActions } = useResolvedFabActions()
  const me = useMe()

  return (
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
  )
}
