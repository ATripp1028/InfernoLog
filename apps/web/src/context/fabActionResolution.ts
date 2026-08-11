// How a page's registered FAB actions become the shape the FAB surfaces
// render. Pure — FabActionsContext owns the state, this owns the arithmetic.

import type { FabAction } from './FabActionsContext'

/**
 * The FAB itself plus the stack that fans out above it.
 *
 * `actions[0]` is always the primary action. The rest are reversed so the
 * array reads farthest-from-FAB first, which is the order the desktop speed
 * dial stacks them bottom-up — authoring order puts the most
 * consequential/least-common action (Delete) first, so it lands furthest from
 * the thumb. MobileNav undoes this for its top-to-bottom sheet; see
 * `sheetActionOrder`.
 */
export function resolveFabActions(actions: readonly FabAction[]): {
  primary: FabAction
  secondaryActions: FabAction[]
} {
  // Every actions array (default or registered via useFabActions) has at
  // least one entry.
  return {
    primary: actions[0]!,
    secondaryActions: actions.slice(1).reverse(),
  }
}

/**
 * A cheap identity for an action set, for use as an effect dependency.
 *
 * Action arrays are rebuilt every render (fresh `onClick` closures), so keying
 * a registration effect on the array reference would re-register — and
 * re-render every FAB consumer — on every render of the calling page. This
 * catches only what changes *which* actions are shown, never closure identity.
 */
export function actionsSignature(
  actions: readonly FabAction[] | null
): string | null {
  if (!actions) return null
  return actions.map((a) => `${a.key}:${a.disabled}:${a.danger}`).join('|')
}
