// The demon list's half of the shared ordering board: it supplies the three
// writes and the response shape, and lib/ordering/useOrderingBoard does the drag
// arithmetic. The MANUAL rating ranking runs the same board with its own writes.

import type { ClassicDemonListResponse } from '@infernolog/core'
import {
  usePlaceOnDemonList,
  useReorderDemonList,
  useRemoveFromDemonList,
} from '@/lib/api/demonList'
import { useOrderingBoard } from '@/lib/ordering/useOrderingBoard'

/**
 * Drag state and the resulting writes for the desktop demon list board.
 */
export function useDemonListBoard({
  data,
  search,
  showUnrated,
  unplacedSearch,
}: {
  data: ClassicDemonListResponse
  search: string
  showUnrated: boolean
  unplacedSearch: string
}) {
  const place = usePlaceOnDemonList()
  const reorder = useReorderDemonList()
  const unplace = useRemoveFromDemonList()

  const board = useOrderingBoard({
    data,
    writes: {
      place,
      reorder,
      unplace,
      reorderMutationKey: ['rankingReorder'],
    },
    search,
    showUnrated,
    unplacedSearch,
  })

  // The board calls it removeFromOrdering; this feature has always called it
  // removeFromDemonList, and its components and specs say so.
  return { ...board, removeFromDemonList: board.removeFromOrdering }
}
