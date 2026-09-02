import { useState } from 'react'
import { OrderingBoard } from '@/components/ordering/OrderingBoard'
import { useManualBoard } from './useManualBoard'
import type { LevelProgressListItem } from '@infernolog/core'

interface ManualRankingBoardProps {
  ranked: readonly LevelProgressListItem[]
  unranked: readonly LevelProgressListItem[]
  /** The page's own search box, shared with the derived modes. */
  search: string
  showUnrated: boolean
}

/**
 * The MANUAL ranking's board.
 *
 * The layout and the drag rules live in `OrderingBoard`, shared with the demon
 * list; this supplies the ranking's own data, writes and wording. The two look
 * and behave alike on purpose — they are the same kind of hand-arranged list,
 * and a user moving between them should not have to learn it twice.
 */
export function ManualRankingBoard({
  ranked,
  unranked,
  search,
  showUnrated,
}: ManualRankingBoardProps) {
  // The unplaced panel searches independently of the page's own box, as on the
  // demon list: you look for something to place while the list stays put.
  const [unplacedSearch, setUnplacedSearch] = useState('')

  const board = useManualBoard({
    ranked,
    unranked,
    search,
    showUnrated,
    unplacedSearch,
  })

  return (
    <OrderingBoard
      board={board}
      unplacedCount={unranked.length}
      unplacedSearch={unplacedSearch}
      onSearchUnplaced={setUnplacedSearch}
      listLabel="ranking"
    />
  )
}
