// How MobileNav turns the resolved FAB actions into its bottom sheet. The
// desktop fan-out and the mobile list read in opposite directions, so the
// order the context hands over is not the order the sheet renders.

import type { FabAction } from '@/context/FabActionsContext'

/**
 * The FAB actions in mobile-sheet order.
 *
 * `secondaryActions` arrives farthest-from-FAB-first, which is what the
 * desktop speed dial fans out bottom-up. The sheet is a plain top-to-bottom
 * list, so that reversal is undone: primary first, then the most
 * consequential/least-common action last (Delete at the bottom, where it is
 * hardest to hit by accident).
 */
export function sheetActionOrder(
  primary: FabAction,
  secondaryActions: readonly FabAction[]
): FabAction[] {
  return [primary, ...secondaryActions.slice().reverse()]
}

/**
 * Whether tapping the FAB should open the sheet.
 *
 * A page registering a single action (e.g. the Collections index's "New
 * collection") triggers it directly — there is no point opening a sheet with
 * one row in it.
 */
export function opensSheet(secondaryActions: readonly FabAction[]): boolean {
  return secondaryActions.length > 0
}
