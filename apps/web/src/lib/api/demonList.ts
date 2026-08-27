import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClassicDemonListResponse,
  ClassicDemonListEntry,
  UnplacedDemonListEntry,
  PlaceOnDemonListInput,
  ReorderDemonListInput,
} from '@infernolog/core'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'
import { invalidateOnEvent } from './activity'
import { toast } from '@/components/generic/sonner'

export type {
  ClassicDemonListResponse,
  ClassicDemonListEntry,
  UnplacedDemonListEntry,
}

/**
 * Key matches the ['ranking'] entry in logging.ts's INVALIDATE_ON_WRITE so a
 * completion log refetches this view (a fresh completion lands in Unplaced).
 */
export const demonListQueryKey = ['demon-list'] as const

/**
 * The classic-ranking board: the placed list hardest-first, plus the unplaced pile.
 */
export function useClassicDemonList() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: demonListQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<ClassicDemonListResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ClassicDemonListResponse }>(
        '/v1/me/demon-list/classic',
        { token, method: 'GET' }
      )
      return data
    },
  })
}

// Optimistic cache helpers — keep the board snappy while the write is in
// flight. Every write returns the whole freshly serialized board, and each
// mutation's onSuccess writes that over the optimistic guess: it carries the
// authoritative fractional indices and ranks, and it is the only thing that
// can correct the cache if a refetch issued mid-write (a completion log
// invalidates ['ranking']) landed with a pre-write snapshot.

function renumber(placed: ClassicDemonListEntry[]): ClassicDemonListEntry[] {
  return placed.map((e, i) => (e.rank === i + 1 ? e : { ...e, rank: i + 1 }))
}

// The slot a placed item lands in, given the two neighbour ids in display
// order (top = hardest). Mirrors the server's bisect: above → just under it.
function insertIndex(
  placed: ClassicDemonListEntry[],
  aboveId?: string,
  belowId?: string
): number {
  if (aboveId) {
    const i = placed.findIndex((e) => e.levelProgressId === aboveId)
    if (i >= 0) return i + 1
  }
  if (belowId) {
    const i = placed.findIndex((e) => e.levelProgressId === belowId)
    if (i >= 0) return i
  }
  return 0 // top of the list
}

function toUnplaced(entry: ClassicDemonListEntry): UnplacedDemonListEntry {
  return {
    levelProgressId: entry.levelProgressId,
    level: entry.level,
    attempts: entry.attempts,
    badge: entry.badge,
  }
}

function toPlaced(
  card: UnplacedDemonListEntry,
  rank: number
): ClassicDemonListEntry {
  return {
    rank,
    levelProgressId: card.levelProgressId,
    rankingIndex: 0, // placeholder; reconciled from the server response
    level: card.level,
    attempts: card.attempts,
    badge: card.badge,
  }
}

interface OptimisticCtx {
  previous: ClassicDemonListResponse | undefined
}

/**
 * PLACE — an unplaced card enters the ranked list.
 */
export function usePlaceOnDemonList() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['rankingReorder'],
    scope: { id: 'rankingReorder' },
    mutationFn: async (
      input: PlaceOnDemonListInput
    ): Promise<ClassicDemonListResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ClassicDemonListResponse }>(
        '/v1/me/demon-list/classic',
        { token, method: 'POST', body: input }
      )
      return data
    },
    onMutate: async (input): Promise<OptimisticCtx> => {
      await qc.cancelQueries({ queryKey: demonListQueryKey })
      const previous = qc.getQueryData<ClassicDemonListResponse>(demonListQueryKey)
      const card = previous?.unplaced.find(
        (u) => u.levelProgressId === input.levelProgressId
      )
      if (previous && card) {
        const placed = previous.placed.slice()
        const at = insertIndex(placed, input.aboveId, input.belowId)
        placed.splice(at, 0, toPlaced(card, at + 1))
        qc.setQueryData<ClassicDemonListResponse>(demonListQueryKey, {
          placed: renumber(placed),
          unplaced: previous.unplaced.filter(
            (u) => u.levelProgressId !== input.levelProgressId
          ),
        })
      }
      return { previous }
    },
    onSuccess: (data) => {
      qc.setQueryData(demonListQueryKey, data)
      // Every ranking write emits an activity event, so the Log page and every
      // level's rank history are stale. Not INVALIDATE_ON_WRITE: a ranking move
      // does not touch the List or collections.
      void invalidateOnEvent(qc)
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(demonListQueryKey, ctx.previous)
      toast.error('Could not save ranking order')
    },
  })
}

/**
 * A reorder's target neighbours plus the id of the entry being moved, which the optimistic update needs and the endpoint takes in its path.
 */
export type ReorderVars = ReorderDemonListInput & { levelProgressId: string }

/**
 * REORDER — move a placed entry between new neighbours.
 */
export function useReorderDemonList() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['rankingReorder'],
    scope: { id: 'rankingReorder' },
    mutationFn: async ({
      levelProgressId,
      ...body
    }: ReorderVars): Promise<ClassicDemonListResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ClassicDemonListResponse }>(
        `/v1/me/demon-list/classic/${encodeURIComponent(levelProgressId)}`,
        { token, method: 'PATCH', body }
      )
      return data
    },
    onMutate: async (vars): Promise<OptimisticCtx> => {
      await qc.cancelQueries({ queryKey: demonListQueryKey })
      const previous = qc.getQueryData<ClassicDemonListResponse>(demonListQueryKey)
      if (previous) {
        const placed = previous.placed.slice()
        const from = placed.findIndex(
          (e) => e.levelProgressId === vars.levelProgressId
        )
        if (from >= 0) {
          const [item] = placed.splice(from, 1)
          const at = insertIndex(placed, vars.aboveId, vars.belowId)
          placed.splice(at, 0, item!)
          qc.setQueryData<ClassicDemonListResponse>(demonListQueryKey, {
            placed: renumber(placed),
            unplaced: previous.unplaced,
          })
        }
      }
      return { previous }
    },
    onSuccess: (data) => {
      qc.setQueryData(demonListQueryKey, data)
      // Every ranking write emits an activity event, so the Log page and every
      // level's rank history are stale. Not INVALIDATE_ON_WRITE: a ranking move
      // does not touch the List or collections.
      void invalidateOnEvent(qc)
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(demonListQueryKey, ctx.previous)
      toast.error('Could not save ranking order')
    },
  })
}

/**
 * UNPLACE — remove a placed entry; it returns to the Unplaced panel.
 */
export function useRemoveFromDemonList() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['rankingReorder'],
    scope: { id: 'rankingReorder' },
    mutationFn: async (
      levelProgressId: string
    ): Promise<ClassicDemonListResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ClassicDemonListResponse }>(
        `/v1/me/demon-list/classic/${encodeURIComponent(levelProgressId)}`,
        { token, method: 'DELETE' }
      )
      return data
    },
    onMutate: async (levelProgressId): Promise<OptimisticCtx> => {
      await qc.cancelQueries({ queryKey: demonListQueryKey })
      const previous = qc.getQueryData<ClassicDemonListResponse>(demonListQueryKey)
      const entry = previous?.placed.find(
        (e) => e.levelProgressId === levelProgressId
      )
      if (previous && entry) {
        qc.setQueryData<ClassicDemonListResponse>(demonListQueryKey, {
          placed: renumber(
            previous.placed.filter((e) => e.levelProgressId !== levelProgressId)
          ),
          unplaced: [toUnplaced(entry), ...previous.unplaced],
        })
      }
      return { previous }
    },
    onSuccess: (data) => {
      qc.setQueryData(demonListQueryKey, data)
      // Every ranking write emits an activity event, so the Log page and every
      // level's rank history are stale. Not INVALIDATE_ON_WRITE: a ranking move
      // does not touch the List or collections.
      void invalidateOnEvent(qc)
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(demonListQueryKey, ctx.previous)
      toast.error('Could not save ranking order')
    },
  })
}
