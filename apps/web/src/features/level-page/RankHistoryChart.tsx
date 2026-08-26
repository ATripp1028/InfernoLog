// The rank chart: this level's position over time, #1 at the top.
//
// A step line rather than a smooth one, because a ranking position is a step
// function — a level holds #8 until the moment something moves it, and joining
// two positions with a diagonal would draw a slide that never happened.
//
// Inline SVG rather than a chart library: the app ships none, and one series
// with a handful of points does not justify adding one.

import { cn } from '@/lib/utils'
import type { RankPoint } from './rankHistoryContent'

const WIDTH = 100
const HEIGHT = 44
// Room above and below the line for the axis labels to sit against.
const PAD_Y = 4

interface Bounds {
  best: number
  worst: number
  /** True when every recorded position is the same one. */
  flat: boolean
  start: number
  end: number
}

function bounds(points: RankPoint[]): Bounds | null {
  const ranked = points.filter(
    (p): p is RankPoint & { position: number } => p.position !== null
  )
  if (ranked.length === 0) return null
  const positions = ranked.map((p) => p.position)
  const best = Math.min(...positions)
  const worst = Math.max(...positions)
  const times = points.map((p) => p.time)
  return {
    best,
    worst,
    // A level that never moved has one position, and a zero-height range would
    // divide by zero. Rather than inventing a second position it never held,
    // the flat case is drawn mid-chart with a single axis label.
    flat: worst === best,
    start: Math.min(...times),
    end: Math.max(...times),
  }
}

function project(point: RankPoint & { position: number }, b: Bounds) {
  const span = b.end - b.start
  const x = span === 0 ? WIDTH / 2 : ((point.time - b.start) / span) * WIDTH
  // #1 is the TOP of the chart: a smaller position is a higher place, which is
  // the opposite of how an SVG y axis runs.
  const y = b.flat
    ? HEIGHT / 2
    : PAD_Y +
      ((point.position - b.best) / (b.worst - b.best)) * (HEIGHT - PAD_Y * 2)
  return { x, y }
}

/**
 * One level's position over time.
 *
 * @param points - Oldest first. A null position is a stretch where the level
 * was not in the ranking, and breaks the line rather than being drawn through.
 */
export function RankHistoryChart({ points }: { points: RankPoint[] }) {
  const b = bounds(points)
  if (!b) return null

  // Each ranked run of points becomes its own path, so an unranked gap leaves a
  // gap rather than a line connecting the two sides of it.
  const segments: string[] = []
  let current: string[] = []
  for (const point of points) {
    if (point.position === null) {
      if (current.length > 0) segments.push(current.join(' '))
      current = []
      continue
    }
    const { x, y } = project({ ...point, position: point.position }, b)
    if (current.length === 0) current.push(`M ${x} ${y}`)
    else current.push(`H ${x}`, `V ${y}`)
  }
  if (current.length > 0) segments.push(current.join(' '))

  const last = [...points].reverse().find((p) => p.position !== null)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label={`Rank over time, best #${b.best}`}
      >
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
        {last && (
          <circle
            {...(() => {
              const { x, y } = project(
                { ...last, position: last.position as number },
                b
              )
              return { cx: x, cy: y }
            })()}
            r="2"
            fill="var(--color-accent)"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 flex flex-col py-0.5 text-[9px] tabular-nums text-text-tertiary',
          // One label, centred against the line, when there is only one
          // position to name.
          b.flat ? 'justify-center' : 'justify-between'
        )}
      >
        <span>#{b.best}</span>
        {!b.flat && <span>#{b.worst}</span>}
      </div>
    </div>
  )
}
