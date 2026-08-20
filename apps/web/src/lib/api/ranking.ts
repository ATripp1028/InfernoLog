import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClassicRankingResponse,
  ClassicRankingEntry,
  UnplacedRankingEntry,
  PlaceRankingInput,
  ReorderRankingInput,
} from '@infernolog/core'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from './client'
import { toast } from '@/components/generic/sonner'

export type {
  ClassicRankingResponse,
  ClassicRankingEntry,
  UnplacedRankingEntry,
}

/**
 * Key matches the ['ranking'] entry in logging.ts's INVALIDATE_ON_WRITE so a
 * completion log refetches this view (a fresh completion lands in Unplaced).
 */
export const rankingQueryKey = ['ranking'] as const

/**
 * The classic-ranking board: the placed list hardest-first, plus the unplaced pile.
 */
export function useClassicRanking() {
  const { isAuthenticated, getIdToken } = useAuth()
  return useQuery({
    queryKey: rankingQueryKey,
    enabled: isAuthenticated,
    queryFn: async (): Promise<ClassicRankingResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ClassicRankingResponse }>(
        '/v1/me/ranking/classic',
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

function renumber(placed: ClassicRankingEntry[]): ClassicRankingEntry[] {
  return placed.map((e, i) => (e.rank === i + 1 ? e : { ...e, rank: i + 1 }))
}

// The slot a placed item lands in, given the two neighbour ids in display
// order (top = hardest). Mirrors the server's bisect: above → just under it.
function insertIndex(
  placed: ClassicRankingEntry[],
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

function toUnplaced(entry: ClassicRankingEntry): UnplacedRankingEntry {
  return {
    levelProgressId: entry.levelProgressId,
    level: entry.level,
    attempts: entry.attempts,
    badge: entry.badge,
  }
}

function toPlaced(
  card: UnplacedRankingEntry,
  rank: number
): ClassicRankingEntry {
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
  previous: ClassicRankingResponse | undefined
}

/**
 * PLACE — an unplaced card enters the ranked list.
 */
export function usePlaceRanking() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['rankingReorder'],
    scope: { id: 'rankingReorder' },
    mutationFn: async (
      input: PlaceRankingInput
    ): Promise<ClassicRankingResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ClassicRankingResponse }>(
        '/v1/me/ranking/classic',
        { token, method: 'POST', body: input }
      )
      return data
    },
    onMutate: async (input): Promise<OptimisticCtx> => {
      await qc.cancelQueries({ queryKey: rankingQueryKey })
      const previous = qc.getQueryData<ClassicRankingResponse>(rankingQueryKey)
      const card = previous?.unplaced.find(
        (u) => u.levelProgressId === input.levelProgressId
      )
      if (previous && card) {
        const placed = previous.placed.slice()
        const at = insertIndex(placed, input.aboveId, input.belowId)
        placed.splice(at, 0, toPlaced(card, at + 1))
        qc.setQueryData<ClassicRankingResponse>(rankingQueryKey, {
          placed: renumber(placed),
          unplaced: previous.unplaced.filter(
            (u) => u.levelProgressId !== input.levelProgressId
          ),
        })
      }
      return { previous }
    },
    onSuccess: (data) => {
      qc.setQueryData(rankingQueryKey, data)
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(rankingQueryKey, ctx.previous)
      toast.error('Could not save ranking order')
    },
  })
}

/**
 * A reorder's target neighbours plus the id of the entry being moved, which the optimistic update needs and the endpoint takes in its path.
 */
export type ReorderVars = ReorderRankingInput & { levelProgressId: string }

/**
 * REORDER — move a placed entry between new neighbours.
 */
export function useReorderRanking() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['rankingReorder'],
    scope: { id: 'rankingReorder' },
    mutationFn: async ({
      levelProgressId,
      ...body
    }: ReorderVars): Promise<ClassicRankingResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ClassicRankingResponse }>(
        `/v1/me/ranking/classic/${encodeURIComponent(levelProgressId)}`,
        { token, method: 'PATCH', body }
      )
      return data
    },
    onMutate: async (vars): Promise<OptimisticCtx> => {
      await qc.cancelQueries({ queryKey: rankingQueryKey })
      const previous = qc.getQueryData<ClassicRankingResponse>(rankingQueryKey)
      if (previous) {
        const placed = previous.placed.slice()
        const from = placed.findIndex(
          (e) => e.levelProgressId === vars.levelProgressId
        )
        if (from >= 0) {
          const [item] = placed.splice(from, 1)
          const at = insertIndex(placed, vars.aboveId, vars.belowId)
          placed.splice(at, 0, item!)
          qc.setQueryData<ClassicRankingResponse>(rankingQueryKey, {
            placed: renumber(placed),
            unplaced: previous.unplaced,
          })
        }
      }
      return { previous }
    },
    onSuccess: (data) => {
      qc.setQueryData(rankingQueryKey, data)
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(rankingQueryKey, ctx.previous)
      toast.error('Could not save ranking order')
    },
  })
}

/**
 * UNPLACE — remove a placed entry; it returns to the Unplaced panel.
 */
export function useUnplaceRanking() {
  const { getIdToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationKey: ['rankingReorder'],
    scope: { id: 'rankingReorder' },
    mutationFn: async (
      levelProgressId: string
    ): Promise<ClassicRankingResponse> => {
      const token = await getIdToken()
      const { data } = await apiFetch<{ data: ClassicRankingResponse }>(
        `/v1/me/ranking/classic/${encodeURIComponent(levelProgressId)}`,
        { token, method: 'DELETE' }
      )
      return data
    },
    onMutate: async (levelProgressId): Promise<OptimisticCtx> => {
      await qc.cancelQueries({ queryKey: rankingQueryKey })
      const previous = qc.getQueryData<ClassicRankingResponse>(rankingQueryKey)
      const entry = previous?.placed.find(
        (e) => e.levelProgressId === levelProgressId
      )
      if (previous && entry) {
        qc.setQueryData<ClassicRankingResponse>(rankingQueryKey, {
          placed: renumber(
            previous.placed.filter((e) => e.levelProgressId !== levelProgressId)
          ),
          unplaced: [toUnplaced(entry), ...previous.unplaced],
        })
      }
      return { previous }
    },
    onSuccess: (data) => {
      qc.setQueryData(rankingQueryKey, data)
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(rankingQueryKey, ctx.previous)
      toast.error('Could not save ranking order')
    },
  })
}
