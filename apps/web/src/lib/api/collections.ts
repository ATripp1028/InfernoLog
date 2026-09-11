// Collections API client — /v1/me/collections.

import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import type {
  CollectionOrdering,
  CollectionSummary,
  CollectionDetail,
  CollectionEntry,
  CopyCollectionEntriesResult,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '@infernolog/core'
import { useAuth } from '@/context/AuthContext'
import {
  browseApiQueryString,
  type LevelBrowseResult,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import { apiFetch, ApiError } from './client'

export type {
  CollectionSummary,
  CollectionDetail,
  CollectionEntry,
  CopyCollectionEntriesResult,
}

/**
 * A row of a collection's browse: a search row plus the entry id its remove
 * button needs. Mirrors core's CollectionBrowseResultSchema as plain TS, like
 * {@link LevelBrowseResult} (JSON carries its dates as strings).
 */
export interface CollectionBrowseRow extends LevelBrowseResult {
  entryId: string
}

/**
 * One page of a collection's browse plus the keyset cursor for the next.
 */
export interface CollectionBrowsePage {
  data: CollectionBrowseRow[]
  nextCursor: string | null
}

/**
 * Machine-readable error codes the collections API returns in `error`.
 * Mirrors COLLECTION_ERRORS in @infernolog/core.
 */
export type CollectionErrorCode =
  | 'DUPLICATE_NAME'
  | 'RESERVED_NAME'
  | 'BUILT_IN_COLLECTION'
  | 'LEVEL_ALREADY_COMPLETED'

/**
 * The machine-readable code from a failed collections request, or `null`.
 *
 * Returns `null` for anything that is not an {@link ApiError} carrying one of
 * the four known codes, so a caller can fall back to the generic message
 * rather than branching on a string it does not recognize.
 */
export function collectionErrorCode(err: unknown): CollectionErrorCode | null {
  if (!(err instanceof ApiError)) return null
  const body = err.body as { error?: unknown } | null
  const code = body && typeof body.error === 'string' ? body.error : null
  return code === 'DUPLICATE_NAME' ||
    code === 'RESERVED_NAME' ||
    code === 'BUILT_IN_COLLECTION' ||
    code === 'LEVEL_ALREADY_COMPLETED'
    ? code
    : null
}

/**
 * Cache key for the collections index (names, counts, previews).
 */
export const collectionsQueryKey = ['collections'] as const
/**
 * Cache key for one collection's full detail, including its entries.
 */
export const collectionQueryKey = (id: string) => ['collections', id] as const
/**
 * Prefix of every browse of one collection (one query per sort/filter state).
 * Nested under {@link collectionQueryKey}, so anything that invalidates or
 * removes the detail by prefix takes the browses with it.
 */
export const collectionBrowseQueryKey = (id: string) =>
  [...collectionQueryKey(id), 'browse'] as const

/**
 * The collections index. Built-ins and custom collections come back together.
 */
export function useCollections() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: collectionsQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<CollectionSummary[]> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionSummary[] }>(
        '/v1/me/collections',
        {
          token,
          method: 'GET',
        }
      )
      return data
    },
  })
}

/**
 * One collection with its entries.
 */
export function useCollection(collectionId: string) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: collectionQueryKey(collectionId),
    enabled: isAuthenticated && !!collectionId,
    queryFn: async (): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        `/v1/me/collections/${encodeURIComponent(collectionId)}`,
        { token, method: 'GET' }
      )
      return data
    },
  })
}

/**
 * Batch-load multiple collection details in parallel, sharing the same cache
 * keys as useCollection. Pass enabled=false to defer loading (e.g. until a
 * dialog step is reached).
 */
export function useCollectionDetails(ids: string[], enabled = true) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: collectionQueryKey(id),
      enabled: isAuthenticated && enabled && !!id,
      queryFn: async (): Promise<CollectionDetail> => {
        const token = await getIdToken()
        const { data } = await apiFetch<{ data: CollectionDetail }>(
          `/v1/me/collections/${encodeURIComponent(id)}`,
          { token, method: 'GET' }
        )
        return data
      },
    })),
  })
}

/**
 * One collection's levels, sorted and filtered like the /search page — what an
 * unordered collection's page lists. Infinite query keyed on the full browse
 * state; each page threads the previous page's opaque keyset cursor.
 */
export function useCollectionBrowse(
  collectionId: string,
  state: SearchPageState
) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useInfiniteQuery({
    queryKey: [...collectionBrowseQueryKey(collectionId), state],
    enabled: isAuthenticated && !!collectionId,
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: CollectionBrowsePage) =>
      last.nextCursor ?? undefined,
    queryFn: async ({ pageParam }): Promise<CollectionBrowsePage> => {
      const token = await getIdToken()
      const qs = browseApiQueryString(state, pageParam)
      return apiFetch<CollectionBrowsePage>(
        `/v1/me/collections/${encodeURIComponent(collectionId)}/levels?${qs}`,
        { token, method: 'GET' }
      )
    },
  })
}

// Writes cache the returned detail, refetch that collection's browses (its
// membership may have changed), and refresh the index (counts/previews).
function useApplyDetail() {
  const qc = useQueryClient()
  return (detail: CollectionDetail) => {
    qc.setQueryData(collectionQueryKey(detail.id), detail)
    void qc.invalidateQueries({ queryKey: collectionBrowseQueryKey(detail.id) })
    void qc.invalidateQueries({ queryKey: collectionsQueryKey, exact: true })
  }
}

/**
 * Creates a custom collection. Fails with `DUPLICATE_NAME` or `RESERVED_NAME`; see {@link collectionErrorCode}.
 */
export function useCreateCollection() {
  const { getIdToken } = useAuth()
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: async (
      input: CreateCollectionInput
    ): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        '/v1/me/collections',
        {
          token,
          method: 'POST',
          body: input,
        }
      )
      return data
    },
    onSuccess: applyDetail,
  })
}

/**
 * Renames or re-describes a collection. Fails with `BUILT_IN_COLLECTION` for Want to Beat and friends.
 */
export function useUpdateCollection() {
  const { getIdToken } = useAuth()
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: async (vars: {
      collectionId: string
      input: UpdateCollectionInput
    }): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        `/v1/me/collections/${encodeURIComponent(vars.collectionId)}`,
        { token, method: 'PATCH', body: vars.input }
      )
      return data
    },
    onSuccess: applyDetail,
  })
}

/**
 * Deletes a custom collection. Built-ins cannot be deleted.
 */
export function useDeleteCollection() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (collectionId: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/collections/${encodeURIComponent(collectionId)}`, {
        token,
        method: 'DELETE',
      })
    },
    onSuccess: (_data, collectionId) => {
      qc.removeQueries({ queryKey: collectionQueryKey(collectionId) })
      void qc.invalidateQueries({ queryKey: collectionsQueryKey, exact: true })
    },
  })
}

/**
 * Adds a level to a collection.
 *
 * Fails with `LEVEL_ALREADY_COMPLETED` when the target is Want to Beat, which
 * only ever holds unbeaten levels.
 */
export function useAddCollectionEntry() {
  const { getIdToken } = useAuth()
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: async (vars: {
      collectionId: string
      levelId: string
    }): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        `/v1/me/collections/${encodeURIComponent(vars.collectionId)}/entries`,
        { token, method: 'POST', body: { levelId: vars.levelId } }
      )
      return data
    },
    onSuccess: applyDetail,
  })
}

/**
 * Removes one entry from a collection.
 */
export function useRemoveCollectionEntry() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationKey: ['removeCollectionEntry'],
    mutationFn: async (vars: {
      collectionId: string
      entryId: string
    }): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        `/v1/me/collections/${encodeURIComponent(vars.collectionId)}/entries/${encodeURIComponent(vars.entryId)}`,
        { token, method: 'DELETE' }
      )
      return data
    },
    // Optimistic removal so the row disappears immediately — from the detail
    // and from any browse of the collection that is showing it. (The prefix
    // cancel below covers the browses too.)
    onMutate: async (vars) => {
      const key = collectionQueryKey(vars.collectionId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CollectionDetail>(key)
      if (previous) {
        qc.setQueryData<CollectionDetail>(key, {
          ...previous,
          entries: previous.entries.filter((e) => e.id !== vars.entryId),
        })
      }
      qc.setQueriesData<InfiniteData<CollectionBrowsePage>>(
        { queryKey: collectionBrowseQueryKey(vars.collectionId) },
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.filter((row) => row.entryId !== vars.entryId),
            })),
          }
      )
      return { previous }
    },
    onError: (_e, vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(collectionQueryKey(vars.collectionId), ctx.previous)
      }
      void qc.invalidateQueries({
        queryKey: collectionBrowseQueryKey(vars.collectionId),
      })
    },
    onSuccess: applyDetail,
  })
}

/**
 * Switches a collection between ordered and unordered. Going unordered
 * discards the curated order; either way the entries are renumbered by level
 * ID. Fails with `ORDERING_FIXED` for Favorites and Least Favorites.
 */
export function useSetCollectionOrdering() {
  const { getIdToken } = useAuth()
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: async (vars: {
      collectionId: string
      ordering: CollectionOrdering
    }): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        `/v1/me/collections/${encodeURIComponent(vars.collectionId)}/ordering`,
        { token, method: 'PUT', body: { ordering: vars.ordering } }
      )
      return data
    },
    onSuccess: applyDetail,
  })
}

/**
 * Adds every level of `sourceCollectionId` that `collectionId` lacks. Into
 * Want to Beat, beaten levels are skipped (and counted) rather than failing
 * the copy.
 */
export function useCopyCollectionEntries() {
  const { getIdToken } = useAuth()
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: async (vars: {
      collectionId: string
      sourceCollectionId: string
    }): Promise<CopyCollectionEntriesResult> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CopyCollectionEntriesResult }>(
        `/v1/me/collections/${encodeURIComponent(vars.collectionId)}/entries/copy`,
        {
          token,
          method: 'POST',
          body: { sourceCollectionId: vars.sourceCollectionId },
        }
      )
      return data
    },
    onSuccess: (result) => applyDetail(result.collection),
  })
}

/**
 * Where an entry lands. Both neighbours omitted is not meaningful — a one-entry list has nothing to reorder.
 */
export interface ReorderEntryVars {
  collectionId: string
  entryId: string
  // Neighbour ENTRY ids in display order (asc): prev = shown above the drop
  // slot, next = shown below. Omit prev for top, next for bottom.
  prevId?: string | undefined
  nextId?: string | undefined
}

/**
 * Moves an entry between two neighbours, optimistically.
 *
 * Serialized under one mutation scope so two quick drags cannot interleave
 * and land the server on the loser's fractional index.
 */
export function useReorderCollectionEntry() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['collectionReorder'],
    scope: { id: 'collectionReorder' },
    mutationFn: async (vars: ReorderEntryVars): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const body: Record<string, string> = {}
      if (vars.prevId) body.prevId = vars.prevId
      if (vars.nextId) body.nextId = vars.nextId
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        `/v1/me/collections/${encodeURIComponent(vars.collectionId)}/entries/${encodeURIComponent(vars.entryId)}`,
        { token, method: 'PATCH', body }
      )
      return data
    },
    // Optimistic reorder mirroring the server's insert-between-neighbours.
    onMutate: async (vars) => {
      const key = collectionQueryKey(vars.collectionId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CollectionDetail>(key)
      if (previous) {
        const entries = previous.entries.slice()
        const from = entries.findIndex((e) => e.id === vars.entryId)
        if (from >= 0) {
          const [moved] = entries.splice(from, 1)
          let at = 0
          if (vars.prevId) {
            const i = entries.findIndex((e) => e.id === vars.prevId)
            if (i >= 0) at = i + 1
          } else if (vars.nextId) {
            const i = entries.findIndex((e) => e.id === vars.nextId)
            if (i >= 0) at = i
          }
          entries.splice(at, 0, moved!)
          qc.setQueryData<CollectionDetail>(key, { ...previous, entries })
        }
      }
      return { previous }
    },
    onError: (_e, vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(collectionQueryKey(vars.collectionId), ctx.previous)
      }
    },
  })
}
