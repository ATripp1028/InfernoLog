// All non-presentational logic for the Ranking page (`src/pages/Ranking.tsx`):
// the query it reads, the ranked model it builds, the search box, and the
// inline rating edit one row at a time.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OverallRatingConfig } from '@infernolog/core'
import { useMe } from '@/lib/api/me'
import { useMyProgress } from '@/lib/api/log'
import { useEditRating, type RatingEdit } from '@/lib/api/ranking'
import { toast } from '@/components/generic/sonner'
import {
  buildRanking,
  filterByDifficulty,
  filterRanking,
  sortRanking,
  toggleDifficulty,
  DEFAULT_SORT,
} from './rankingModel'
import type { RankedEntry, RankingSort } from './rankingModel'

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
  const [sort, setSort] = useState<RankingSort>(DEFAULT_SORT)
  // Empty is "All", the default view.
  const [difficulties, setDifficulties] = useState<string[]>([])

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
    () =>
      sortRanking(
        filterRanking(filterByDifficulty(model.entries, difficulties), search),
        sort
      ),
    [model.entries, difficulties, search, sort]
  )

  /**
   * Sorts by a column, or flips it if it is already the active one.
   *
   * A fresh column starts descending — best first, which is what someone
   * clicking "Gameplay" is asking to see.
   */
  const toggleSort = useCallback((key: string) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    )
  }, [])

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

  /**
   * Saves the open row's edit, holding the editor open until the server answers.
   *
   * The editor is the user's work in progress; closing it the instant they
   * press save would mean a failure has nothing left to fail back into. It
   * closes on success, and on failure stays exactly as it was so the values can
   * be corrected and sent again.
   */
  const save = useCallback(
    (edit: RatingEdit) => {
      scrolledFor.current = null
      editRating.mutate(edit, {
        onSuccess: () => {
          setEditingLevelId(null)
          setPendingScrollId(edit.levelId)
          toast.success('Rating saved.')
        },
        onError: (error) =>
          toast.error(
            error instanceof Error && error.message
              ? error.message
              : "Couldn't save that rating."
          ),
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
    // The lowest position in the WHOLE ranking, not the filtered view — a
    // search must not promote whatever it matched last to "worst rated".
    lastRank: model.entries.length,
    visible,
    unrankedCount: model.unrankedCount,
    search,
    setSearch,
    sort,
    toggleSort,
    difficulties,
    toggleDifficulty: useCallback(
      (difficulty: string) =>
        setDifficulties((current) => toggleDifficulty(current, difficulty)),
      []
    ),
    clearDifficulties: useCallback(() => setDifficulties([]), []),
    editingLevelId,
    // Both guarded while a save is in flight: the row is mid-commit, and
    // moving to another one — or abandoning this one — would leave the user
    // unable to see what happened to it.
    startEdit: useCallback(
      (levelId: string) => {
        if (!editRating.isPending) setEditingLevelId(levelId)
      },
      [editRating.isPending]
    ),
    cancelEdit: useCallback(() => {
      if (!editRating.isPending) setEditingLevelId(null)
    }, [editRating.isPending]),
    save,
    saving: editRating.isPending,
  }
}
