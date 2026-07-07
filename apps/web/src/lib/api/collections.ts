// Collections API client — /v1/me/collections.

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type {
  CollectionSummary,
  CollectionDetail,
  CollectionEntry,
  CreateCollectionInput,
  UpdateCollectionInput,
} from '@infernolog/core'
import { useAuth } from '../../context/AuthContext'
import { apiFetch, ApiError } from './client'

export type { CollectionSummary, CollectionDetail, CollectionEntry }

// Machine-readable error codes the collections API returns in `error`.
// Mirrors COLLECTION_ERRORS in @infernolog/core.
export type CollectionErrorCode =
  | 'DUPLICATE_NAME'
  | 'RESERVED_NAME'
  | 'BUILT_IN_COLLECTION'
  | 'LEVEL_ALREADY_COMPLETED'

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

export const collectionsQueryKey = ['collections'] as const
export const collectionQueryKey = (id: string) => ['collections', id] as const

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

export function useCollection(collectionId: string) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: collectionQueryKey(collectionId),
    enabled: isAuthenticated && !!collectionId,
    queryFn: async (): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        `/v1/me/collections/${collectionId}`,
        { token, method: 'GET' }
      )
      return data
    },
  })
}

// Batch-load multiple collection details in parallel, sharing the same cache
// keys as useCollection. Pass enabled=false to defer loading (e.g. until a
// dialog step is reached).
export function useCollectionDetails(ids: string[], enabled = true) {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: collectionQueryKey(id),
      enabled: isAuthenticated && enabled && !!id,
      queryFn: async (): Promise<CollectionDetail> => {
        const token = await getIdToken()
        const { data } = await apiFetch<{ data: CollectionDetail }>(
          `/v1/me/collections/${id}`,
          { token, method: 'GET' }
        )
        return data
      },
    })),
  })
}

// Writes cache the returned detail and refresh the index (counts/previews).
function useApplyDetail() {
  const qc = useQueryClient()
  return (detail: CollectionDetail) => {
    qc.setQueryData(collectionQueryKey(detail.id), detail)
    void qc.invalidateQueries({ queryKey: collectionsQueryKey, exact: true })
  }
}

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
        `/v1/me/collections/${vars.collectionId}`,
        { token, method: 'PATCH', body: vars.input }
      )
      return data
    },
    onSuccess: applyDetail,
  })
}

export function useDeleteCollection() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (collectionId: string): Promise<void> => {
      const token = await getIdToken()
      await apiFetch(`/v1/me/collections/${collectionId}`, {
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
        `/v1/me/collections/${vars.collectionId}/entries`,
        { token, method: 'POST', body: { levelId: vars.levelId } }
      )
      return data
    },
    onSuccess: applyDetail,
  })
}

export function useRemoveCollectionEntry() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  const applyDetail = useApplyDetail()
  return useMutation({
    mutationFn: async (vars: {
      collectionId: string
      entryId: string
    }): Promise<CollectionDetail> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: CollectionDetail }>(
        `/v1/me/collections/${vars.collectionId}/entries/${vars.entryId}`,
        { token, method: 'DELETE' }
      )
      return data
    },
    // Optimistic removal so the row disappears immediately.
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
      return { previous }
    },
    onError: (_e, vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(collectionQueryKey(vars.collectionId), ctx.previous)
      }
    },
    onSuccess: applyDetail,
  })
}

export interface ReorderEntryVars {
  collectionId: string
  entryId: string
  // Neighbour ENTRY ids in display order (asc): prev = shown above the drop
  // slot, next = shown below. Omit prev for top, next for bottom.
  prevId?: string | undefined
  nextId?: string | undefined
}

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
        `/v1/me/collections/${vars.collectionId}/entries/${vars.entryId}`,
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
