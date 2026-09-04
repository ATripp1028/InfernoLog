import type { ClassicDemonListResponse } from '@infernolog/core'
import { OrderingBoard } from '@/components/ordering/OrderingBoard'
import { useDemonListBoard } from './useDemonListBoard'

interface DemonListBoardProps {
  data: ClassicDemonListResponse
  search: string
  showUnrated: boolean
  onSearchUnplaced: (v: string) => void
  unplacedSearch: string
  // levelProgressId to highlight (post-log handoff).
  highlightId?: string | undefined
}

/**
 * The demon list's desktop board.
 *
 * The layout and the drag rules live in `OrderingBoard`, shared with the MANUAL
 * rating ranking; this supplies the demon list's own data, writes and wording.
 */
export function DemonListBoard({
  data,
  search,
  showUnrated,
  unplacedSearch,
  onSearchUnplaced,
  highlightId,
}: DemonListBoardProps) {
  const board = useDemonListBoard({ data, search, showUnrated, unplacedSearch })

  return (
    <OrderingBoard
      board={board}
      unplacedCount={data.unplaced.length}
      unplacedSearch={unplacedSearch}
      onSearchUnplaced={onSearchUnplaced}
      listLabel="demon list"
      highlightId={highlightId}
    />
  )
}
