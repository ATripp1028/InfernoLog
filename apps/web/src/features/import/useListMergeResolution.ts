// The resolve-lists sub-flow's state: the order conflicts the check found,
// and the walk through them one board at a time.
//
// Like useConflictResolution, this hook decides nothing about what follows —
// `confirmAndAdvance` returns the completed order map when the last board is
// confirmed and lets the flow commit.

import { useCallback, useMemo, useState } from 'react'
import type { ImportCheckResponse, ImportListMerge } from '@/lib/api/import'
import { RANKING_MERGE_KEY } from './importWizardModel'

export function useListMergeResolution() {
  const [collectionsMerge, setCollectionsMerge] = useState<ImportListMerge[]>(
    []
  )
  const [rankingMerge, setRankingMerge] = useState<ImportListMerge | null>(null)
  const [listMergeIndex, setListMergeIndex] = useState(0)
  const [resolvedListOrders, setResolvedListOrders] = useState<
    Map<string, string[]>
  >(new Map())

  // One sub-step per touched collection (from the check response, already
  // filtered to hasConflict ones only), plus Ranking last if present. Derived
  // rather than stored: collectionsMerge/rankingMerge only change once, right
  // after the check call, and stay fixed for the rest of the sub-flow.
  const queue = useMemo(
    () => [
      ...collectionsMerge.map((m) => ({ key: m.list!, merge: m })),
      ...(rankingMerge
        ? [{ key: RANKING_MERGE_KEY, merge: rankingMerge }]
        : []),
    ],
    [collectionsMerge, rankingMerge]
  )

  const store = useCallback((result: ImportCheckResponse) => {
    setCollectionsMerge(result.collectionsMerge)
    setRankingMerge(result.rankingMerge)
  }, [])

  // Start the walk from the first board with a clean slate of resolved orders.
  const begin = useCallback(() => {
    setListMergeIndex(0)
    setResolvedListOrders(new Map())
  }, [])

  // Record one board's final order and move to the next. Returns the complete
  // key → order map when that was the last board, otherwise null.
  const confirmAndAdvance = useCallback(
    (finalOrder: string[]): Map<string, string[]> | null => {
      const current = queue[listMergeIndex]
      if (!current) return null
      const nextOrders = new Map(resolvedListOrders).set(
        current.key,
        finalOrder
      )
      setResolvedListOrders(nextOrders)
      if (listMergeIndex + 1 < queue.length) {
        setListMergeIndex((i) => i + 1)
        return null
      }
      return nextOrders
    },
    [queue, listMergeIndex, resolvedListOrders]
  )

  // Drop every merge the check found — used when the user cancels back to
  // review.
  const reset = useCallback(() => {
    setCollectionsMerge([])
    setRankingMerge(null)
    setListMergeIndex(0)
    setResolvedListOrders(new Map())
  }, [])

  // Memoized for the same reason as useConflictResolution's return: the
  // flow's callbacks depend on this object.
  return useMemo(
    () => ({
      current: queue[listMergeIndex] ?? null,
      hasMerges: queue.length > 0,
      store,
      begin,
      confirmAndAdvance,
      reset,
    }),
    [queue, listMergeIndex, store, begin, confirmAndAdvance, reset]
  )
}
