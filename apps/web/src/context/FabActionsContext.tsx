import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'
import { useDefaultFabActions } from '@/features/logging/useDefaultFabActions'

// The one action shape shared by every page's FAB: an icon, a name, and a
// method to call when clicked. `actions[0]` is always the primary action —
// the FAB itself; the rest fan out above it (see DesktopHoverFab /
// MobileNav), farthest-from-FAB first in authoring order (most
// consequential/least-common action first, e.g. Delete before Edit).
export interface FabAction {
  key: string
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean | undefined
  danger?: boolean | undefined
}

interface FabActionsContextValue {
  // Whichever action set is currently active — a page's override (via
  // useFabActions) or the default logging actions — already split into the
  // FAB itself and the fan-out stack above it (farthest-from-FAB first).
  primary: FabAction
  secondaryActions: FabAction[]
  setOverride: (actions: FabAction[] | null) => void
}

const FabActionsContext = createContext<FabActionsContextValue | null>(null)

// Mounted once in Shell. Resolves whichever action set is active and renders
// the default action set's dialogs (Want to Beat / Add to Collection)
// exactly once — they stay mounted but closed whenever a page's override is
// showing instead, same as the default actions that would open them.
export function FabActionsProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<FabAction[] | null>(null)
  const { actions: defaultActions, dialogs } = useDefaultFabActions()

  const actions = override ?? defaultActions
  // Every actions array (default or registered via useFabActions) has at
  // least one entry.
  const primary = actions[0]!
  const secondaryActions = actions.slice(1).reverse()

  return (
    <FabActionsContext.Provider
      value={{ primary, secondaryActions, setOverride }}
    >
      {children}
      {dialogs}
    </FabActionsContext.Provider>
  )
}

function useFabActionsContext() {
  const ctx = useContext(FabActionsContext)
  if (!ctx) {
    throw new Error(
      'useFabActions/useResolvedFabActions must be used within FabActionsProvider'
    )
  }
  return ctx
}

// Read by the desktop Fab and MobileNav to render whichever action set is
// currently active.
export function useResolvedFabActions() {
  const { primary, secondaryActions } = useFabActionsContext()
  return { primary, secondaryActions }
}

// Called by a page to replace the FAB's actions while it's mounted (e.g. the
// level page's owner actions, or the collections page's actions). Pass
// `null` to fall back to the default action set — e.g. when the current
// user doesn't own the level being viewed.
export function useFabActions(actions: FabAction[] | null) {
  const { setOverride } = useFabActionsContext()
  // Actions arrays are rebuilt every render (fresh onClick closures) — key
  // the effect on a cheap signature instead of the array reference so we
  // don't re-register (and re-render every FAB consumer) on every render of
  // the calling page. The signature only needs to catch changes that affect
  // *which* actions are shown, not closure identity.
  const signature = actions
    ? actions.map((a) => `${a.key}:${a.disabled}:${a.danger}`).join('|')
    : null

  useEffect(() => {
    setOverride(actions)
    return () => setOverride(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, setOverride])
}
