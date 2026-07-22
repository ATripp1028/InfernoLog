import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'

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
  actions: FabAction[] | null
  setActions: (actions: FabAction[] | null) => void
}

const FabActionsContext = createContext<FabActionsContextValue>({
  actions: null,
  setActions: () => {},
})

export function FabActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<FabAction[] | null>(null)
  const value = useMemo(() => ({ actions, setActions }), [actions])
  return (
    <FabActionsContext.Provider value={value}>
      {children}
    </FabActionsContext.Provider>
  )
}

// Read by the desktop `Fab` and `MobileNav` to get whichever action set is
// currently active. `null` means no page has overridden it — render the
// default (logging) actions instead.
export function useFabActionsOverride() {
  return useContext(FabActionsContext).actions
}

// Called by a page to replace the FAB's actions while it's mounted (e.g. the
// level page's owner actions, or the collections page's actions). Pass
// `null` to fall back to the default action set — e.g. when the current
// user doesn't own the level being viewed.
export function useFabActions(actions: FabAction[] | null) {
  const { setActions } = useContext(FabActionsContext)
  // Actions arrays are rebuilt every render (fresh onClick closures) — key
  // the effect on a cheap signature instead of the array reference so we
  // don't re-register (and re-render every FAB consumer) on every render of
  // the calling page. The signature only needs to catch changes that affect
  // *which* actions are shown, not closure identity.
  const signature = actions
    ? actions.map((a) => `${a.key}:${a.disabled}:${a.danger}`).join('|')
    : null

  useEffect(() => {
    setActions(actions)
    return () => setActions(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, setActions])
}
