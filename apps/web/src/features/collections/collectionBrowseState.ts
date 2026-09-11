// A collection page's URL state. An unordered collection is browsed like the
// /search page — the same query, filters and sorts, held in the URL the same
// way — except that it defaults to level-ID order and has no relevance sort.
// Ordered collections ignore these params.

import {
  LEVEL_SORT_OPTIONS,
  reconcileExtremeSort,
  validateSearchState,
  type LevelSearchBy,
  type LevelSort,
  type LevelSortOption,
  type SearchPageState,
} from '@/lib/levelSearchParams'

/** An unordered collection's order when the user hasn't picked one. */
export const COLLECTION_DEFAULT_SORT: LevelSort = 'levelId'

/**
 * An unordered collection's sort menu: level ID first, then every /search sort
 * but relevance, which only means something against the whole cache.
 */
export const COLLECTION_SORT_OPTIONS: LevelSortOption[] = [
  { value: 'levelId', label: 'Level ID' },
  ...LEVEL_SORT_OPTIONS.filter((o) => o.value !== 'relevance'),
]

const COLLECTION_SORTS = COLLECTION_SORT_OPTIONS.map((o) => o.value)

/**
 * The collection route's search params — a browse state with its defaults left
 * out, so a plain link to a collection needs none and a fresh page has a clean
 * URL.
 */
export type CollectionSearchParams = Omit<
  SearchPageState,
  'searchBy' | 'sort'
> & {
  searchBy?: LevelSearchBy | undefined
  sort?: LevelSort | undefined
}

/**
 * The browse state a collection URL stands for, with the defaults filled in.
 */
export function collectionBrowseState(
  params: CollectionSearchParams
): SearchPageState {
  return reconcileExtremeSort(
    {
      ...params,
      searchBy: params.searchBy ?? 'name',
      sort: params.sort ?? COLLECTION_DEFAULT_SORT,
    },
    COLLECTION_DEFAULT_SORT
  )
}

/**
 * The URL params for a browse state — the inverse of
 * {@link collectionBrowseState}, dropping the defaults. Also holds an
 * extremes-only sort to its filter, as the /search page does.
 */
export function toCollectionSearchParams(
  state: SearchPageState
): CollectionSearchParams {
  const { searchBy, sort, ...rest } = reconcileExtremeSort(
    state,
    COLLECTION_DEFAULT_SORT
  )
  return {
    ...rest,
    searchBy: searchBy === 'name' ? undefined : searchBy,
    sort: sort === COLLECTION_DEFAULT_SORT ? undefined : sort,
  }
}

/**
 * The route's validateSearch: coerces a raw (possibly hand-edited) URL into
 * well-formed params, accepting only the collection's sorts.
 */
export function validateCollectionSearch(
  raw: Record<string, unknown>
): CollectionSearchParams {
  return toCollectionSearchParams(
    validateSearchState(raw, {
      sorts: COLLECTION_SORTS,
      defaultSort: COLLECTION_DEFAULT_SORT,
    })
  )
}
