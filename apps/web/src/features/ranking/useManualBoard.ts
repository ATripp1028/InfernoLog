// The MANUAL ranking's half of the shared ordering board: it supplies the three
// writes and maps the ranking's rows into the board's vocabulary. The drag
// arithmetic is lib/ordering/useOrderingBoard, shared with the demon list.
//
// The two are the same board on different axes — the demon list orders
// completions by how hard they were, this by how good they were — so they
// differ only in what a drop is written to, and in the word "ranking".

import { useMemo } from 'react'
import {
  usePlaceRating,
  useRemoveRating,
  useReorderRating,
} from '@/lib/api/ratingRanking'
import { useOrderingBoard } from '@/lib/ordering/useOrderingBoard'
import type { OrderedItem } from '@/lib/ordering/types'
import type { LevelProgressListItem } from '@infernolog/core'

/**
 * The ranking has no tier badge of its own — it was removed as adding nothing
 * to a quality ordering — so every row passes `badge: null`, which renders
 * nothing rather than a placeholder.
 */
function toOrderedItem(item: LevelProgressListItem): OrderedItem {
  return {
    levelProgressId: item.levelProgressId,
    level: item.level,
    badge: null,
    attempts: item.entry?.attempts ?? null,
  }
}

/**
 * Drag state and the resulting writes for the MANUAL ranking board.
 *
 * @param ranked - The stored order, best first.
 * @param unranked - Completions with no place yet.
 */
export function useManualBoard({
  ranked,
  unranked,
  search,
  showUnrated,
  unplacedSearch,
}: {
  ranked: readonly LevelProgressListItem[]
  unranked: readonly LevelProgressListItem[]
  search: string
  showUnrated: boolean
  unplacedSearch: string
}) {
  const place = usePlaceRating()
  const reorder = useReorderRating()
  const unplace = useRemoveRating()

  const data = useMemo(
    () => ({
      placed: ranked.map((item, i) => ({ ...toOrderedItem(item), rank: i + 1 })),
      unplaced: unranked.map(toOrderedItem),
    }),
    [ranked, unranked]
  )

  return useOrderingBoard({
    data,
    writes: {
      place,
      reorder,
      unplace,
      // Its own key, so an in-flight demon list move cannot freeze this board's
      // resync and vice versa.
      reorderMutationKey: ['ratingReorder'],
    },
    search,
    showUnrated,
    unplacedSearch,
  })
}
