import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { LucideIcon } from 'lucide-react'
import { useDefaultFabActions } from './useDefaultFabActions'
import {
  actionsSignature,
  disableAll,
  resolveFabActions,
} from './fabActionResolution'

/**
 * The one action shape shared by every page's FAB: an icon, a name, and a
 * method to call when clicked. `actions[0]` is always the primary action —
 * the FAB itself; the rest fan out above it (see DesktopHoverFab /
 * MobileNav), farthest-from-FAB first in authoring order (most
 * consequential/least-common action first, e.g. Delete before Edit).
 */
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
  // Optional context header for the mobile FAB bottom sheet (e.g. the level
  // name on the Global Level Page). Null for the default actions and any page
  // that doesn't set one.
  sheetHeader: string | null
  setOverride: (
    actions: FabAction[] | 'pending' | null,
    sheetHeader?: string | null
  ) => void
}

const FabActionsContext = createContext<FabActionsContextValue | null>(null)

/**
 * Mounted once in Shell. Resolves whichever action set is active and renders
 * the default action set's dialogs (Want to Beat / Add to Collection)
 * exactly once — they stay mounted but closed whenever a page's override is
 * showing instead, same as the default actions that would open them.
 */
export function FabActionsProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<FabAction[] | 'pending' | null>(
    null
  )
  const [sheetHeader, setSheetHeader] = useState<string | null>(null)
  const { actions: defaultActions, dialogs } = useDefaultFabActions()

  const setOverride = useCallback(
    (actions: FabAction[] | 'pending' | null, header: string | null = null) => {
      setOverrideState(actions)
      // A header only makes sense alongside an override's own action set —
      // 'pending' renders the defaults, which a page's name must not label.
      setSheetHeader(actions && actions !== 'pending' ? header : null)
    },
    []
  )

  // 'pending' keeps whatever the FAB would otherwise show — the defaults,
  // since a page in that state has registered no set of its own — but inert,
  // so a tap can't fire an action the page is about to replace.
  const { primary, secondaryActions } = resolveFabActions(
    override === 'pending'
      ? disableAll(defaultActions)
      : (override ?? defaultActions)
  )

  return (
    <FabActionsContext.Provider
      value={{ primary, secondaryActions, sheetHeader, setOverride }}
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

/**
 * Read by the desktop Fab and MobileNav to render whichever action set is
 * currently active.
 */
export function useResolvedFabActions() {
  const { primary, secondaryActions, sheetHeader } = useFabActionsContext()
  return { primary, secondaryActions, sheetHeader }
}

/**
 * Called by a page to replace the FAB's actions while it's mounted (e.g. the
 * level page's owner actions, or the collections page's actions). Pass
 * `null` to fall back to the default action set — e.g. when the current
 * user doesn't own the level being viewed. Pass `'pending'` while the page
 * cannot yet tell which of the two applies: the FAB renders disabled until
 * it can, rather than offering one set and swapping to the other a moment
 * later. `sheetHeader` optionally sets a context header for the mobile FAB
 * bottom sheet (e.g. the level name).
 */
export function useFabActions(
  actions: FabAction[] | 'pending' | null,
  sheetHeader?: string | null
) {
  const { setOverride } = useFabActionsContext()
  const signature = actionsSignature(actions)

  useEffect(() => {
    setOverride(actions, sheetHeader ?? null)
    return () => setOverride(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, sheetHeader, setOverride])
}
