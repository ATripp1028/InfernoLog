// The Log page's state: filters, the paginated feed, and the day grouping.

import { useCallback, useMemo, useState } from 'react'
import type { ActivityFeedKind } from '@infernolog/core'
import { useActivityFeed, type ActivityFilters } from '@/lib/api/activity'
import { useMe } from '@/lib/api/me'
import { useMyProgress } from '@/lib/api/list'
import { formatNumber } from '@/features/logging/format'
import { groupByDay } from './feedContent'
import type { FeedRowContext } from './FeedRow'
import {
  levelOptions,
  rangeStart,
  type ActivityRangeKey,
  type LevelOption,
} from './logFilters'

/**
 * Everything the Log page renders from.
 *
 * @returns `days` is the loaded pages flattened and grouped; `context` carries
 * the viewer's display preferences and current rating categories, which
 * per-category score rows are resolved against by id.
 */
export function useLogPage() {
  const me = useMe()
  const progress = useMyProgress()

  const [kinds, setKinds] = useState<ActivityFeedKind[]>([])
  const [levelId, setLevelId] = useState<string | null>(null)
  const [range, setRange] = useState<ActivityRangeKey>('any')
  const [glossaryOpen, setGlossaryOpen] = useState(false)

  // `from` is recomputed per render rather than stored, so a page left open
  // across midnight does not keep filtering against yesterday's boundary. It
  // is part of the query key, so the crossing refetches on its own.
  const filters: ActivityFilters = useMemo(
    () => ({
      kinds,
      categories: [],
      levelId,
      from: rangeStart(range),
      to: null,
    }),
    [kinds, levelId, range]
  )

  const feed = useActivityFeed(filters)

  const items = useMemo(
    () => feed.data?.pages.flatMap((page) => page.data) ?? [],
    [feed.data]
  )

  const datePref = me.data?.dateFormatPreference ?? 'MDY'
  const days = useMemo(() => groupByDay(items, datePref), [items, datePref])

  const context: FeedRowContext = useMemo(
    () => ({
      datePref,
      scale: me.data?.ratingDisplayScale ?? 'ZERO_TO_HUNDRED',
      categories: me.data?.ratingCategories ?? [],
    }),
    [datePref, me.data?.ratingDisplayScale, me.data?.ratingCategories]
  )

  const options: LevelOption[] = useMemo(
    () => levelOptions(progress.data),
    [progress.data]
  )

  const toggleKind = useCallback((kind: ActivityFeedKind) => {
    setKinds((current) =>
      current.includes(kind)
        ? current.filter((k) => k !== kind)
        : [...current, kind]
    )
  }, [])

  const clearAll = useCallback(() => {
    setKinds([])
    setLevelId(null)
    setRange('any')
  }, [])

  // "12 entries" while more pages remain reads as a total, which it is not —
  // so an incomplete feed says so rather than quoting a number that grows as
  // the user scrolls.
  const countLabel = feed.hasNextPage
    ? `${formatNumber(items.length)}+ entries`
    : `${formatNumber(items.length)} ${items.length === 1 ? 'entry' : 'entries'}`

  return {
    days,
    items,
    context,
    isLoading: feed.isLoading || me.isLoading,
    isError: feed.isError,
    hasNextPage: feed.hasNextPage,
    isFetchingNextPage: feed.isFetchingNextPage,
    fetchNextPage: feed.fetchNextPage,
    kinds,
    toggleKind,
    clearKinds: () => setKinds([]),
    levelId,
    setLevelId,
    levelOptions: options,
    range,
    setRange,
    clearAll,
    canClear: kinds.length > 0 || levelId !== null || range !== 'any',
    countLabel,
    glossaryOpen,
    setGlossaryOpen,
  }
}
