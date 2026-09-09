// The rank chart: this level's position over time, #1 at the top, on a grid.
//
// A step line rather than a smooth one, because a ranking position is a step
// function — a level holds #8 until the moment something moves it, and joining
// two positions with a diagonal would draw a slide that never happened.
//
// Inline SVG rather than a chart library: the app ships none, and one series
// with a handful of points does not justify adding one.
//
// Everything here is drawn in real pixels at the measured container width, so
// `<text>` inside the SVG is never stretched. That is what lets the axis
// labels sit in gutters beside the plot instead of floating over it, which is
// how they used to collide with the line.

import type { DateFormatPreference } from '@/lib/api/wireEnums'
import type { RankChartGeometry } from './rankChartGeometry'
import type { RankPoint } from './rankHistoryContent'
import { useRankHistoryChart } from './useRankHistoryChart'

const LABEL_SIZE = 9
const AXIS_COLOR = 'var(--color-border)'
const GRID_COLOR = 'var(--color-border-subtle)'
const TICK_TEXT = 'var(--color-text-tertiary)'

/** Snap a 1px line to the pixel grid, so a gridline is a hairline and not a smear. */
function crisp(value: number): number {
  return Math.round(value) + 0.5
}

function Grid({ geometry }: { geometry: RankChartGeometry }) {
  const { plot, rankTicks, timeTicks } = geometry
  return (
    <g aria-hidden>
      {rankTicks.map((tick) => (
        <g key={`rank-${tick.position}`}>
          <line
            x1={plot.x}
            x2={plot.x + plot.width}
            y1={crisp(tick.y)}
            y2={crisp(tick.y)}
            stroke={GRID_COLOR}
            strokeWidth="1"
            shapeRendering="crispEdges"
          />
          <text
            x={plot.x - 6}
            y={tick.y + 3}
            textAnchor="end"
            fontSize={LABEL_SIZE}
            fill={TICK_TEXT}
            className="tabular-nums"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {timeTicks.map((tick, i) => (
        <g key={`time-${tick.time}-${i}`}>
          <line
            x1={crisp(tick.x)}
            x2={crisp(tick.x)}
            y1={plot.y}
            y2={plot.y + plot.height}
            stroke={GRID_COLOR}
            strokeWidth="1"
            shapeRendering="crispEdges"
          />
          {tick.label && (
            <text
              x={tick.x}
              y={plot.y + plot.height + 13}
              // The first and last labels would hang off the frame if they
              // were centred on their gridline.
              textAnchor={
                i === 0
                  ? 'start'
                  : i === timeTicks.length - 1
                    ? 'end'
                    : 'middle'
              }
              fontSize={LABEL_SIZE}
              fill={TICK_TEXT}
              className="tabular-nums"
            >
              {tick.label}
            </text>
          )}
        </g>
      ))}
      <line
        x1={crisp(plot.x)}
        x2={crisp(plot.x)}
        y1={plot.y}
        y2={plot.y + plot.height}
        stroke={AXIS_COLOR}
        strokeWidth="1"
        shapeRendering="crispEdges"
      />
      <line
        x1={plot.x}
        x2={plot.x + plot.width}
        y1={crisp(plot.y + plot.height)}
        y2={crisp(plot.y + plot.height)}
        stroke={AXIS_COLOR}
        strokeWidth="1"
        shapeRendering="crispEdges"
      />
    </g>
  )
}

/**
 * One level's position over time.
 *
 * @param points - Oldest first. A null position is a stretch where the level
 * was not in the ranking, and breaks the line rather than being drawn through.
 * @param datePref - Field order for the date labels along the x axis.
 */
export function RankHistoryChart({
  points,
  datePref,
}: {
  points: RankPoint[]
  datePref: DateFormatPreference
}) {
  const { containerRef, geometry } = useRankHistoryChart(points, datePref)

  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-bg-surface px-2 py-1">
      {/* The measured element is this inner div, not the framed one: an
          element's clientWidth includes its own padding, and measuring the
          padded box would draw a chart 16px wider than the space it has. */}
      <div ref={containerRef}>
        {geometry === null ? (
          <p className="py-8 text-center text-xs text-text-tertiary">
            No ranked history to chart yet.
          </p>
        ) : (
          <svg
            width={geometry.width}
            height={geometry.height}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            className="block"
            role="img"
            aria-label={geometry.summary}
          >
            <Grid geometry={geometry} />

            {geometry.segments.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            ))}

            {geometry.dots.map((dot) => (
              <g key={dot.key}>
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={dot === geometry.current ? 3 : 2}
                  fill="var(--color-accent)"
                >
                  <title>{dot.title}</title>
                </circle>
                {dot.label && (
                  <text
                    x={dot.x}
                    y={dot.labelY}
                    textAnchor={dot.labelAnchor}
                    fontSize={LABEL_SIZE}
                    fill="var(--color-text-secondary)"
                    className="tabular-nums"
                    // A halo in the panel's own background colour, so a label
                    // that lands on a gridline or on the line itself stays
                    // readable instead of being read through.
                    stroke="var(--color-bg-surface)"
                    strokeWidth="3"
                    paintOrder="stroke"
                  >
                    {dot.label}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}
