// State for the rank-history panel.
//
// The "other levels' moves" toggle is visit-local UI state, not a saved
// preference: it answers "what else was going on" while the user is looking at
// this level, and a preference that outlived the visit would be a setting
// nobody asked for.

import { useMemo, useState } from 'react'
import { useRankHistory } from '@/lib/api/activity'
import {
  isOwnMove,
  rankSeries,
  rankStats,
  type RankPoint,
  type RankStats,
} from './rankHistoryContent'
import type { RankHistoryEntry } from '@infernolog/core'

export type RankHistoryTab = 'chart' | 'events'

export interface RankHistoryPanelState {
  isLoading: boolean
  isError: boolean
  /** True when the level has never been in the user's ranking. */
  isEmpty: boolean
  entries: RankHistoryEntry[]
  points: RankPoint[]
  stats: RankStats
  tab: RankHistoryTab
  setTab: (tab: RankHistoryTab) => void
  showOthers: boolean
  setShowOthers: (show: boolean) => void
  /** How many entries the toggle is hiding, for its hint. */
  hiddenCount: number
}

/**
 * Loads and shapes one level's rank history.
 *
 * @param enabled - False on a level the user has no entry for, so the panel
 * does not fire a request for a history that cannot exist.
 */
export function useRankHistoryPanel(
  levelId: string,
  enabled = true
): RankHistoryPanelState {
  const query = useRankHistory(levelId, enabled)
  const [tab, setTab] = useState<RankHistoryTab>('chart')
  const [showOthers, setShowOthers] = useState(true)

  const all = useMemo(() => query.data?.data ?? [], [query.data])
  const currentPosition = query.data?.currentPosition ?? null

  const entries = useMemo(
    () => (showOthers ? all : all.filter(isOwnMove)),
    [all, showOthers]
  )

  // The chart always draws the full history: hiding other levels' moves would
  // leave a line that jumps between the user's own moves with nothing to
  // explain the gaps between them.
  const points = useMemo(
    () => rankSeries(all, currentPosition),
    [all, currentPosition]
  )
  const stats = useMemo(
    () => rankStats(all, currentPosition),
    [all, currentPosition]
  )

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    isEmpty: all.length === 0 && currentPosition === null,
    entries,
    points,
    stats,
    tab,
    setTab,
    showOthers,
    setShowOthers,
    hiddenCount: all.length - all.filter(isOwnMove).length,
  }
}
