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
  EMPTY_CUSTOM_RANGE,
  levelOptions,
  rangeBounds,
  rangeIsActive,
  type ActivityRangeKey,
  type CustomRange,
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
  const [customRange, setCustomRange] =
    useState<CustomRange>(EMPTY_CUSTOM_RANGE)

  // Recomputed per render rather than stored, so a page left open across
  // midnight does not keep filtering against yesterday's boundary. The bounds
  // are part of the query key, so the crossing refetches on its own.
  const filters: ActivityFilters = useMemo(() => {
    const { from, to } = rangeBounds(range, customRange)
    return { kinds, categories: [], levelId, from, to }
  }, [kinds, levelId, range, customRange])

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
    setCustomRange(EMPTY_CUSTOM_RANGE)
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
    datePref,
    // Scoped to the feed, not the page: the filters stay usable — and stay put
    // — while a filter change is loading. A page-level spinner would unmount
    // the control the user just touched.
    isLoading: feed.isLoading,
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
    customRange,
    setCustomRange,
    clearAll,
    canClear:
      kinds.length > 0 || levelId !== null || rangeIsActive(range, customRange),
    countLabel,
  }
}
