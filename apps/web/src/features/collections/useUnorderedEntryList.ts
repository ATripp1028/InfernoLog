// Logic for UnorderedEntryList: the URL-held browse state, the search bar
// wired to write it back to the collection's own route, the scoped browse
// query, and infinite scroll.

import { useNavigate, useSearch } from '@tanstack/react-router'
import { useLevelSearchBar } from '@/components/inputs/levelSearch/useLevelSearchBar'
import {
  useCollectionBrowse,
  type CollectionDetail,
} from '@/lib/api/collections'
import {
  hasActiveFilters,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import { rowStatKeys } from '@/lib/rowStats'
import { useInfiniteScrollSentinel } from '@/lib/useInfiniteScrollSentinel'
import {
  collectionBrowseState,
  toCollectionSearchParams,
} from './collectionBrowseState'

/**
 * State for an unordered collection's level list.
 */
export function useUnorderedEntryList(collection: CollectionDetail) {
  const params = useSearch({ from: '/_authenticated/collections/$collectionId' })
  const navigate = useNavigate()
  const state = collectionBrowseState(params)

  // Replace, not push: every keystroke and filter tweak is not a history entry.
  const commit = (next: SearchPageState) =>
    navigate({
      to: '/collections/$collectionId',
      params: { collectionId: collection.id },
      search: toCollectionSearchParams(next),
      replace: true,
    })

  // A number typed here is matched against the collection's own level ids by
  // the browse, rather than jumping to that level's page.
  const bar = useLevelSearchBar(state, { commit, levelIdJump: false })
  const browse = useCollectionBrowse(collection.id, state)
  const sentinelRef = useInfiniteScrollSentinel(browse)

  const status = browse.isError
    ? ('error' as const)
    : browse.isPending
      ? ('loading' as const)
      : ('ready' as const)

  return {
    state,
    bar,
    update: (patch: Partial<SearchPageState>) => commit({ ...state, ...patch }),
    // The filter panel's Clear all — keeps the query, like /search.
    resetFilters: () =>
      commit({ query: state.query, searchBy: state.searchBy, sort: state.sort }),
    // The no-results state's way out: drop the query too.
    clearSearch: () => commit({ searchBy: state.searchBy, sort: state.sort }),
    narrowed: !!state.query?.trim() || hasActiveFilters(state),
    status,
    retry: () => void browse.refetch(),
    rows: browse.data?.pages.flatMap((p) => p.data) ?? [],
    statKeys: rowStatKeys(state),
    sentinelRef,
    isFetchingNextPage: browse.isFetchingNextPage,
  }
}
