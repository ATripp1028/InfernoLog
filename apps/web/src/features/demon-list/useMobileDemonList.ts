// Logic for MobileDemonList: edit mode, the ↑/↓/# move arithmetic that
// stands in for drag-and-drop on touch, and placing into / removing from the
// ranking, which on touch replace dragging between the two columns.
//
// Extracted from MobileDemonList so the move arithmetic can be exercised
// without rendering the list.

import { useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { ClassicDemonListResponse } from '@infernolog/core'
import { toast } from '@/components/generic/sonner'
import {
  usePlaceOnDemonList,
  useReorderDemonList,
  useRemoveFromDemonList,
} from '@/lib/api/demonList'
import { neighboursAround } from '@/lib/neighbours'
import { filterPlaced, filterUnplaced, reorderDisabled } from '@/lib/ordering/filters'

/**
 * State and the reorder/place/unplace writes for the mobile ranking list.
 */
export function useMobileDemonList({
  data,
  search,
  showUnrated,
}: {
  data: ClassicDemonListResponse
  search: string
  showUnrated: boolean
}) {
  const reorder = useReorderDemonList()
  const place = usePlaceOnDemonList()
  const unplace = useRemoveFromDemonList()
  const [editMode, setEditMode] = useState(false)
  const [unplacedOpen, setUnplacedOpen] = useState(false)
  const [jumpFor, setJumpFor] = useState<string | null>(null)
  const [jumpValue, setJumpValue] = useState('')

  const placedIds = data.placed.map((e) => e.levelProgressId)
  const view = filterPlaced(data.placed, search, showUnrated)
  const filtering = reorderDisabled(data.placed.length, view.length, search)
  const unplacedView = filterUnplaced(data.unplaced, search)

  /** Nudge a row one position up or down. */
  function move(id: string, dir: 'up' | 'down') {
    const i = placedIds.indexOf(id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= placedIds.length) return
    const next = arrayMove(placedIds, i, j)
    reorder.mutate({ levelProgressId: id, ...neighboursAround(next, j) })
  }

  /**
   * Jump a row to a typed rank. The number is 1-based and clamped into the
   * list, so a wild value lands at the nearest end rather than doing nothing.
   */
  function submitJump(id: string) {
    const n = parseInt(jumpValue, 10)
    setJumpFor(null)
    setJumpValue('')
    if (!Number.isFinite(n)) return
    const target = Math.min(Math.max(n, 1), placedIds.length) - 1
    const i = placedIds.indexOf(id)
    if (i < 0 || i === target) return
    const next = arrayMove(placedIds, i, target)
    reorder.mutate({ levelProgressId: id, ...neighboursAround(next, target) })
  }

  // Removal confirms with a toast where placement does not: the level lands in
  // the unplaced sheet, which is closed, so the row simply vanishing is the
  // only other feedback there would be.
  function removeFromDemonList(id: string) {
    if (!placedIds.includes(id)) return
    unplace.mutate(id)
    toast.success('Removed from your demon list — it is back in Unplaced.')
  }

  // Mobile placement: drop the tapped level in at the top, then let the user
  // nudge it with ↑/↓/#. (No drag-and-drop on touch.)
  function placeFromUnplaced(id: string) {
    const belowId = placedIds[0]
    place.mutate({ levelProgressId: id, ...(belowId ? { belowId } : {}) })
    setUnplacedOpen(false)
    setEditMode(true)
    toast.success('Placed at #1 — use ↑/↓ or # to move it.')
  }

  return {
    // View
    view,
    unplacedView,
    filtering,
    // Editing is only offered when nothing is hidden — a row's position
    // relative to what it cannot see is ambiguous.
    canEdit: editMode && !filtering,

    // Edit mode
    editMode,
    setEditMode,
    toggleEditMode: () => setEditMode((v) => !v),

    // The unplaced sheet
    unplacedOpen,
    setUnplacedOpen,
    placeFromUnplaced,

    // Moving
    move,
    removeFromDemonList,
    jumpFor,
    setJumpFor,
    jumpValue,
    setJumpValue,
    submitJump,
  }
}
