// All non-presentational logic for the Ranking page (`src/pages/Ranking.tsx`):
// the query it reads, the ranked model it builds, and the search box's state.

import { useMemo, useState } from 'react'
import { useMe } from '@/lib/api/me'
import { useMyProgress } from '@/lib/api/log'
import { buildRanking, filterRanking } from './rankingModel'
import type { RankedEntry } from './rankingModel'

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

  // Empty in SIMPLE mode, where per-category scores carry no meaning even
  // though switching modes preserves them.
  const categories = useMemo(
    () =>
      me.data?.ratingMode === 'WEIGHTED' ? (me.data.ratingCategories ?? []) : [],
    [me.data]
  )

  const model = useMemo(
    () => buildRanking(progress.data ?? [], categories),
    [progress.data, categories]
  )

  const visible: RankedEntry[] = useMemo(
    () => filterRanking(model.entries, search),
    [model.entries, search]
  )

  return {
    isPending: progress.isPending || me.isPending,
    isError: progress.isError,
    scale: me.data?.ratingDisplayScale ?? 'ZERO_TO_TEN',
    entries: model.entries,
    visible,
    unrankedCount: model.unrankedCount,
    search,
    setSearch,
  }
}
