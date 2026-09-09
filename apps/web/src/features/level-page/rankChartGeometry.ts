// Where every mark on the rank chart goes: the plot box, the grid, the step
// path, and the dots with their labels. RankHistoryChart.tsx draws what this
// returns and decides nothing about position itself.
//
// Two things drive the shape of this module.
//
// The axis labels used to be an HTML overlay sitting *on top of* the plot, so
// a line passing near the left edge ran straight through the "#4". They now
// live in gutters the plot is inset from, which is what `PAD_*` is for: no
// mark and no label share space by construction.
//
// And the y axis is a rank axis, so its ticks are whole numbers — a tick at
// #4.5 names a position nobody can hold. Every step here is an integer, and
// the domain is padded by one rank in each direction so the line never runs
// along the frame. That padding is also what gives a level that has never
// moved three rows to sit in — the rank above it, its own, and the rank below
// — rather than a single flat line with one label.

import type { DateFormatPreference } from '@/lib/api/wireEnums'
import { formatDate } from '@/lib/dateFormat'
import type { RankPoint } from './rankHistoryContent'

/** Overall chart height in px. Width comes from the container at render time. */
export const CHART_HEIGHT = 172
/** Gutter holding the rank labels, to the left of the plot. */
export const PAD_LEFT = 34
/** Gutter holding the date labels, below the plot. */
export const PAD_BOTTOM = 20
export const PAD_TOP = 12
export const PAD_RIGHT = 10

/** Width assumed before the container has been measured. */
export const FALLBACK_WIDTH = 360

/** Rank steps a y tick is allowed to land on. A rank axis has no fractions. */
const RANK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
const TARGET_RANK_TICKS = 6

/** Roughly how wide a date label is, used to decide how many x ticks fit. */
const DATE_LABEL_WIDTH = 76

/** The plot area: everything inside the gutters. */
export interface PlotBox {
  x: number
  y: number
  width: number
  height: number
}

/** One horizontal gridline, labelled with the rank it sits at. */
export interface RankTick {
  position: number
  y: number
  label: string
}

/**
 * One vertical gridline, labelled with the date it sits at.
 *
 * `label` is empty when the tick would repeat the previous tick's text — the
 * gridline still earns its place, a second identical date does not.
 */
export interface TimeTick {
  time: number
  x: number
  label: string
}

/** A marked point on the series. */
export interface RankDot {
  key: string
  x: number
  y: number
  position: number
  time: number
  /** The rank text, or null when placing it would have collided with another. */
  label: string | null
  /** Baseline for {@link label} — above the dot, or below it near the top edge. */
  labelY: number
  /** Which side of the dot the label runs from; see `labelAnchor`. */
  labelAnchor: LabelAnchor
  /** Full text for the dot's native tooltip. */
  title: string
}

export interface RankChartGeometry {
  width: number
  height: number
  plot: PlotBox
  rankTicks: RankTick[]
  timeTicks: TimeTick[]
  /** One path per unbroken ranked run; an unranked gap ends a path. */
  segments: string[]
  dots: RankDot[]
  /** The most recent ranked dot, drawn emphasised as "where it sits now". */
  current: RankDot | null
  best: number
  worst: number
  /** A one-line summary for the chart's accessible name. */
  summary: string
}

type RankedPoint = RankPoint & { position: number }

function isRanked(point: RankPoint): point is RankedPoint {
  return point.position !== null
}

/**
 * The span of ranks the y axis covers, padded either side of what was held.
 *
 * At least one rank each way, so a level that has never moved still gets three
 * rows — the rank above it, its own, and the rank below. Proportional above
 * that, because one rank of padding on a fifty-rank swing is two pixels and
 * reads as no padding at all.
 *
 * Clamped at #1, since no rank sits above it. A level parked at #1 therefore
 * takes its third row from below instead of above; `scaleTop` is what keeps it
 * off the frame.
 */
export function rankDomain(
  best: number,
  worst: number
): { top: number; bottom: number; scaleTop: number } {
  const pad = Math.max(1, Math.ceil((worst - best) * 0.1))
  const top = Math.max(1, best - pad)
  let bottom = worst + pad
  // Three rows minimum. A level that has never moved has best === worst and
  // would otherwise be a two-row chart.
  while (bottom - top < 2) bottom += 1
  return {
    top,
    bottom,
    // The axis cannot go above #1, so a level sitting at #1 would be drawn
    // along the top edge with its dot half outside the plot. Half a rank of
    // headroom costs nothing and no tick lands in it.
    scaleTop: top === 1 ? 0.5 : top,
  }
}

/** The smallest whole-rank step that keeps the tick count near {@link TARGET_RANK_TICKS}. */
export function rankStep(span: number): number {
  for (const step of RANK_STEPS) {
    if (span / step <= TARGET_RANK_TICKS) return step
  }
  return RANK_STEPS[RANK_STEPS.length - 1]!
}

function rankTicks(
  top: number,
  bottom: number,
  toY: (position: number) => number
): RankTick[] {
  const step = rankStep(bottom - top)
  const ticks: RankTick[] = []
  // #1 is worth naming whenever it is on the axis, even when the step would
  // skip it — "the top of the list" is the one rank a reader looks for.
  if (top === 1 && step > 1) {
    ticks.push({ position: 1, y: toY(1), label: '#1' })
  }
  const first = Math.max(step, Math.ceil(top / step) * step)
  for (let position = first; position <= bottom; position += step) {
    ticks.push({ position, y: toY(position), label: `#${position}` })
  }
  return ticks
}

/**
 * A short numeric date for an axis tick, in the user's field order.
 *
 * Numeric rather than locale-formatted on purpose: the axis has room for about
 * six characters, and a `toLocaleDateString` month name is both longer and
 * different on every runner. The precision drops as the window widens — a
 * chart spanning years labels years.
 */
export function axisDateLabel(
  time: number,
  preference: DateFormatPreference,
  spanMs: number
): string {
  const date = new Date(time)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const DAY = 86_400_000

  if (spanMs > 730 * DAY) return String(year)
  if (spanMs > 120 * DAY) {
    const mm = String(month).padStart(2, '0')
    return preference === 'ISO' ? `${year}-${mm}` : `${mm}/${year}`
  }
  if (preference === 'ISO') {
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return preference === 'DMY' ? `${day}/${month}` : `${month}/${day}`
}

function timeTicks(
  start: number,
  end: number,
  plot: PlotBox,
  preference: DateFormatPreference
): TimeTick[] {
  const span = end - start
  if (span === 0) {
    return [
      {
        time: start,
        x: plot.x + plot.width / 2,
        label: axisDateLabel(start, preference, 0),
      },
    ]
  }
  const count = Math.max(
    2,
    Math.min(5, Math.floor(plot.width / DATE_LABEL_WIDTH) + 1)
  )
  const ticks: TimeTick[] = []
  let previous = ''
  for (let i = 0; i < count; i += 1) {
    const fraction = i / (count - 1)
    const time = start + fraction * span
    const label = axisDateLabel(time, preference, span)
    ticks.push({
      time,
      x: plot.x + fraction * plot.width,
      // A repeated label is noise — two ticks a week apart in a two-year
      // window both read "2026", and one of them is enough.
      label: label === previous ? '' : label,
    })
    if (label !== previous) previous = label
  }
  return ticks
}

/** The step path for each unbroken ranked run, oldest first. */
function stepSegments(
  points: RankPoint[],
  toX: (time: number) => number,
  toY: (position: number) => number
): string[] {
  const segments: string[] = []
  let current: string[] = []
  for (const point of points) {
    if (!isRanked(point)) {
      if (current.length > 0) segments.push(current.join(' '))
      current = []
      continue
    }
    const x = toX(point.time)
    const y = toY(point.position)
    // A ranking is a step function: a level holds #8 until the moment
    // something moves it, so the line runs flat and then turns.
    if (current.length === 0) current.push(`M ${x} ${y}`)
    else current.push(`H ${x}`, `V ${y}`)
  }
  if (current.length > 0) segments.push(current.join(' '))
  return segments
}

/**
 * Which ranked points get a dot.
 *
 * Every point where the position changes, plus the ends of each run — a dot on
 * each of ten identical points in a row says nothing the flat line does not.
 */
function dotPoints(points: RankPoint[]): RankedPoint[] {
  const ranked = points.filter(isRanked)
  return ranked.filter((point, i) => {
    if (i === 0 || i === ranked.length - 1) return true
    const previous = ranked[i - 1]!
    const next = ranked[i + 1]!
    return (
      point.position !== previous.position || point.position !== next.position
    )
  })
}

interface LabelBox {
  x0: number
  x1: number
  y0: number
  y1: number
}

type LabelAnchor = 'start' | 'middle' | 'end'

/** Roughly how wide a label renders: ~5.2px per character at the 9px type size. */
function labelWidth(text: string): number {
  return text.length * 5.2 + 4
}

function labelBox(
  x: number,
  y: number,
  text: string,
  anchor: LabelAnchor
): LabelBox {
  const width = labelWidth(text)
  const x0 =
    anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2
  return { x0, x1: x0 + width, y0: y - 9, y1: y + 2 }
}

/**
 * Which side of its dot a label sits on.
 *
 * Centred by default, and pushed inward at the two ends of the plot — a label
 * clamped to the frame instead would drift off its dot and land on the y axis
 * labels, which is the collision this chart exists to stop.
 */
function labelAnchor(x: number, text: string, plot: PlotBox): LabelAnchor {
  const half = labelWidth(text) / 2
  if (x - half < plot.x) return 'start'
  if (x + half > plot.x + plot.width) return 'end'
  return 'middle'
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

/**
 * Attach a rank label to as many dots as fit without colliding.
 *
 * Only the dot that *starts* a run of one position is a candidate: a level
 * that held #7 for a month has a dot at each end of that flat stretch, and
 * labelling both writes "#7" twice for one fact.
 *
 * Candidates are placed in the order a reader looks for them — the most recent
 * move, then the best position reached, then the first, then the rest left to
 * right — so when the chart is too crowded for all of them, the ones that
 * survive are the ones worth reading. A dropped label is not lost: every dot
 * still carries its full value in a tooltip.
 */
function placeLabels(dots: RankDot[], plot: PlotBox): void {
  const candidates = dots
    .map((dot, i) => i)
    .filter((i) => i === 0 || dots[i - 1]!.position !== dots[i]!.position)
  if (candidates.length === 0) return

  const order: number[] = []
  const push = (index: number | undefined) => {
    if (index !== undefined && !order.includes(index)) order.push(index)
  }
  push(candidates[candidates.length - 1])
  push(
    candidates.reduce((best, i) =>
      dots[i]!.position < dots[best]!.position ? i : best
    )
  )
  push(candidates[0])
  candidates.forEach(push)

  const placed: LabelBox[] = []
  for (const index of order) {
    const dot = dots[index]!
    const text = `#${dot.position}`
    // Above the dot, except near the top of the plot where there is no room.
    const above = dot.y - 7 >= plot.y + 9
    const y = above ? dot.y - 7 : dot.y + 14
    const anchor = labelAnchor(dot.x, text, plot)
    const box = labelBox(dot.x, y, text, anchor)
    if (placed.some((other) => overlaps(box, other))) continue
    placed.push(box)
    dot.label = text
    dot.labelY = y
    dot.labelAnchor = anchor
  }
}

/**
 * Everything the rank chart draws, for one series at one width.
 *
 * @param points - Oldest first, as `rankSeries` returns them. A null position
 * is a stretch where the level was not in the ranking; it breaks the line
 * rather than being drawn through.
 * @param width - Measured container width in px. The whole coordinate system
 * is px, so text is never stretched by the viewBox.
 * @returns Null when no point in the series is ranked, since there is then no
 * axis to draw and nothing to put on it.
 */
export function rankChartGeometry(
  points: RankPoint[],
  width: number,
  preference: DateFormatPreference
): RankChartGeometry | null {
  const ranked = points.filter(isRanked)
  if (ranked.length === 0) return null

  const positions = ranked.map((point) => point.position)
  const best = Math.min(...positions)
  const worst = Math.max(...positions)
  const times = points.map((point) => point.time)
  const start = Math.min(...times)
  const end = Math.max(...times)

  const plot: PlotBox = {
    x: PAD_LEFT,
    y: PAD_TOP,
    width: Math.max(40, width - PAD_LEFT - PAD_RIGHT),
    height: CHART_HEIGHT - PAD_TOP - PAD_BOTTOM,
  }

  const { top, bottom, scaleTop } = rankDomain(best, worst)
  // #1 is the TOP of the chart: a smaller position is a higher place, which is
  // the opposite of how an SVG y axis runs.
  const toY = (position: number) =>
    plot.y + ((position - scaleTop) / (bottom - scaleTop)) * plot.height
  const toX = (time: number) =>
    end === start
      ? plot.x + plot.width / 2
      : plot.x + ((time - start) / (end - start)) * plot.width

  const dots: RankDot[] = dotPoints(points).map((point, i) => ({
    key: `${point.time}-${point.position}-${i}`,
    x: toX(point.time),
    y: toY(point.position),
    position: point.position,
    time: point.time,
    label: null,
    labelY: toY(point.position) - 7,
    labelAnchor: 'middle',
    // The tooltip carries the full date, since it is where a reader goes when
    // the axis's short form is not enough.
    title: `#${point.position} on ${formatDate(new Date(point.time), preference)}`,
  }))
  placeLabels(dots, plot)

  return {
    width,
    height: CHART_HEIGHT,
    plot,
    rankTicks: rankTicks(top, bottom, toY),
    timeTicks: timeTicks(start, end, plot, preference),
    segments: stepSegments(points, toX, toY),
    dots,
    current: dots.length > 0 ? dots[dots.length - 1]! : null,
    best,
    worst,
    summary:
      best === worst
        ? `Rank over time, held at #${best}`
        : `Rank over time, between #${best} and #${worst}`,
  }
}
