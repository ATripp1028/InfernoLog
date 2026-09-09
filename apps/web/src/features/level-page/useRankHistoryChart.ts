// The one thing the rank chart needs at runtime that the geometry cannot know:
// how wide it actually is.
//
// The chart draws in real pixels rather than a stretched viewBox, because a
// stretched viewBox distorts text — which is why the old chart could not put
// its axis labels inside the SVG in the first place. Real pixels means the
// container has to be measured, and re-measured when the layout changes.

import { useCallback, useMemo, useRef, useState } from 'react'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import {
  FALLBACK_WIDTH,
  rankChartGeometry,
  type RankChartGeometry,
} from './rankChartGeometry'
import type { RankPoint } from './rankHistoryContent'

export interface RankHistoryChartState {
  /** Attach to the chart's wrapper element; it is what gets measured. */
  containerRef: (el: HTMLDivElement | null) => void
  /** Null when no point in the series is ranked and there is nothing to plot. */
  geometry: RankChartGeometry | null
}

/**
 * Measures the chart's container and lays the series out inside it.
 *
 * @param points - Oldest first, as `rankSeries` returns them.
 * @param datePref - Drives the x axis labels' field order.
 */
export function useRankHistoryChart(
  points: RankPoint[],
  datePref: DateFormatPreference
): RankHistoryChartState {
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  const observer = useRef<ResizeObserver | null>(null)

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    // A zero width is an element that has not been laid out yet — jsdom, or a
    // hidden tab. Keep the fallback rather than collapsing the plot to nothing.
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    observer.current = ro
  }, [])

  const geometry = useMemo(
    () => rankChartGeometry(points, width, datePref),
    [points, width, datePref]
  )

  return { containerRef, geometry }
}
