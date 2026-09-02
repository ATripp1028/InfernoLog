// All non-presentational logic for the Ranking page (`src/pages/Ranking.tsx`):
// the query it reads, the ranked model it builds, the search box, and the
// inline rating edit one row at a time.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OverallRatingConfig } from '@infernolog/core'
import { useMe } from '@/lib/api/me'
import { useMyProgress } from '@/lib/api/log'
import { useEditRating, type RatingEdit } from '@/lib/api/ranking'
import { useRatingRanking } from '@/lib/api/ratingRanking'
import { toast } from '@/components/generic/sonner'
import {
  buildManualRanking,
  buildRanking,
  filterByDifficulty,
  filterByRatedStatus,
  filterRanking,
  renumberInView,
  sortRanking,
  toggleDifficulty,
  DEFAULT_SORT,
} from './rankingModel'
import type { RankedEntry, RankNumbering, RankingSort } from './rankingModel'

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
  // On by default, as on the demon list: a user who went out of their way to
  // log an in-game-unrated level almost certainly wants to see it.
  const [showUnrated, setShowUnrated] = useState(true)
  const [numbering, setNumbering] = useState<RankNumbering>('overall')

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

  // MANUAL is the one mode whose order is stored rather than derived, so it is
  // the one mode that has to be fetched. The other two would only be paying a
  // round trip for an answer they can already compute.
  const isManual = me.data?.ratingMode === 'MANUAL'
  const manual = useRatingRanking(isManual)

  const model = useMemo(() => {
    if (isManual) {
      return buildManualRanking(
        progress.data ?? [],
        (manual.data?.ranked ?? []).map((r) => r.levelProgressId)
      )
    }
    return buildRanking(progress.data ?? [], categories)
  }, [isManual, manual.data, progress.data, categories])

  const visible: RankedEntry[] = useMemo(() => {
    const narrowed = filterRanking(
      filterByDifficulty(
        filterByRatedStatus(model.entries, showUnrated),
        difficulties
      ),
      search
    )
    const ordered = sortRanking(narrowed, sort)
    return numbering === 'filtered' ? renumberInView(ordered) : ordered
  }, [model.entries, showUnrated, difficulties, search, sort, numbering])

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
    isManual,
    isPending:
      progress.isPending || me.isPending || (isManual && manual.isPending),
    // `me` counts as a failure, not just as missing: the progress list is
    // persisted to localStorage and so can render from cache while GET /v1/me
    // is unavailable (it does not retry). Falling back to the SIMPLE defaults
    // there would show a WEIGHTED user a single-rating editor and then PATCH a
    // `simpleRating` their overall rating is not computed from.
    isError: progress.isError || me.isError,
    scale: me.data?.ratingDisplayScale ?? 'ZERO_TO_TEN',
    config,
    categories,
    entries: model.entries,
    // The bottom of whatever the numbers are counting: the whole ranking when
    // numbering by it, the visible rows when numbering those. Keeping the two
    // in step is what stops a filtered view from marking a mid-table level
    // crimson, or a whole-ranking view from marking one that is merely last on
    // screen.
    lastRank: numbering === 'filtered' ? visible.length : model.entries.length,
    visible,
    unrankedCount: model.unrankedCount,
    search,
    setSearch,
    sort,
    toggleSort,
    showUnrated,
    setShowUnrated,
    numbering,
    setNumbering,
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
