import type { HistoryState } from '@tanstack/react-router'

// Where a page's back arrow should return to, carried as router location
// `state` (not a search param) so it stays out of the URL and naturally
// disappears on a hard refresh or a shared link — there's no sensible "back"
// without a real navigation that set it.
export interface BackOrigin {
  href: string
}

interface BackOriginHistoryState {
  backOrigin?: BackOrigin
}

// `HistoryState` is normally extended via `declare module '@tanstack/history'`,
// but that module isn't directly resolvable from this app's tsconfig (it's a
// transitive dependency reached only through @tanstack/react-router), so we
// cast through it instead of augmenting it globally. Safe: HistoryState has no
// required fields, so the shapes are mutually assignable.
export function backOriginState(href: string): HistoryState {
  const state: BackOriginHistoryState = { backOrigin: { href } }
  return state as HistoryState
}

export function readBackOrigin(state: HistoryState): BackOrigin | undefined {
  return (state as BackOriginHistoryState).backOrigin
}
