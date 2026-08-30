// All non-presentational logic for the Ranking page (`src/pages/Ranking.tsx`):
// the query it reads, the ranked model it builds, the search box, and the
// inline rating edit one row at a time.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OverallRatingConfig } from '@infernolog/core'
import { useMe } from '@/lib/api/me'
import { useMyProgress } from '@/lib/api/log'
import { useEditRating, type RatingEdit } from '@/lib/api/ranking'
import { toast } from '@/components/generic/sonner'
import { buildRanking, filterRanking } from './rankingModel'
import type { RankedEntry } from './rankingModel'

/** The DOM id of a row, for the scroll that follows a save. */
export const rowDomId = (levelId: string) => `rank-${levelId}`

/**
 * Everything the Ranking page renders from.
 *
 * There is no ranking endpoint: the page is a second view over the Log's
 * `['log']` query, which already carries a server-computed `overallRating` per
 * the user's mode. That means it is already cached, already invalidated by
 * every write path, and cannot drift from the Log page's numbers.
 */
export function useRankingPage() {
  const me = useMe()
  const progress = useMyProgress()
  const [search, setSearch] = useState('')
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null)

  // Empty in SIMPLE mode, where per-category scores carry no meaning even
  // though switching modes preserves them.
  //
  // Sorted by priority here rather than relying on the order they arrive in.
  // `GET /v1/me` does order by `sortOrder`, but the column order has to match
  // the order the ranking breaks ties in — core's comparator sorts defensively
  // for the same reason — and that agreement should not rest on a server-side
  // `orderBy` clause staying put.
  const categories = useMemo(() => {
    if (me.data?.ratingMode !== 'WEIGHTED') return []
    return [...(me.data.ratingCategories ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder
    )
  }, [me.data])

  // The same shape the server ranks with, so an optimistic reorder lands where
  // the refetch will confirm.
  const config: OverallRatingConfig = useMemo(
    () => ({
      ratingMode: me.data?.ratingMode ?? 'SIMPLE',
      includeEnjoyment: me.data?.includeEnjoyment ?? false,
      enjoymentWeight: me.data?.enjoymentWeight ?? 0,
      categoryWeights: new Map(categories.map((c) => [c.id, c.weight])),
    }),
    [me.data, categories]
  )

  const editRating = useEditRating(config)

  const model = useMemo(
    () => buildRanking(progress.data ?? [], categories),
    [progress.data, categories]
  )

  const visible: RankedEntry[] = useMemo(
    () => filterRanking(model.entries, search),
    [model.entries, search]
  )

  // Set when a save moves a row, cleared once the row has been brought into
  // view. Held as state rather than acted on inline because the row has to be
  // in its new DOM position before it can be scrolled to.
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)
  const scrolledFor = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingScrollId) return
    if (scrolledFor.current === pendingScrollId) return
    scrolledFor.current = pendingScrollId
    document
      .getElementById(rowDomId(pendingScrollId))
      // The row is already at its new index in the DOM — Framer animates the
      // transform from where it was — so this scrolls to where it is going,
      // and the two movements read as one.
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setPendingScrollId(null)
  }, [pendingScrollId, visible])

  const save = useCallback(
    (edit: RatingEdit) => {
      setEditingLevelId(null)
      scrolledFor.current = null
      editRating.mutate(edit, {
        onSuccess: () => setPendingScrollId(edit.levelId),
        onError: () =>
          toast.error("Couldn't save that rating. Your change was undone."),
      })
    },
    [editRating]
  )

  return {
    isPending: progress.isPending || me.isPending,
    isError: progress.isError,
    scale: me.data?.ratingDisplayScale ?? 'ZERO_TO_TEN',
    config,
    categories,
    entries: model.entries,
    visible,
    unrankedCount: model.unrankedCount,
    search,
    setSearch,
    editingLevelId,
    startEdit: setEditingLevelId,
    cancelEdit: useCallback(() => setEditingLevelId(null), []),
    save,
    saving: editRating.isPending,
  }
}
