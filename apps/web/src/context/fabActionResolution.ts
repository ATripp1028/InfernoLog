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
 * The same action set, with every action greyed out.
 *
 * Used for the `'pending'` registration (see {@link useFabActions}): a page
 * that cannot yet say which actions apply keeps the FAB looking the same but
 * inert, rather than offering actions it is about to replace.
 */
export function disableAll(actions: readonly FabAction[]): FabAction[] {
  return actions.map((action) => ({ ...action, disabled: true }))
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
  actions: readonly FabAction[] | 'pending' | null
): string | null {
  if (!actions) return null
  // A sentinel, not a set — it never collides with a real signature because
  // a real one always contains a ':'.
  if (actions === 'pending') return 'pending'
  return actions.map((a) => `${a.key}:${a.disabled}:${a.danger}`).join('|')
}
