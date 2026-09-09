/**
 * The rank chart's layout.
 *
 * Two rules carry the weight here.
 *
 * A rank axis is an integer axis running the wrong way round: #1 is the top of
 * the chart and the smallest number, so every projection inverts against the
 * y coordinate, and a tick at #4.5 names a position nobody can hold.
 *
 * And a level that has never moved must still get three rows — the rank above
 * it, its own, and the rank below — because a single flat line with one label
 * is the case this chart was rewritten to fix.
 */

import { describe, expect, it } from 'vitest'
import {
  axisDateLabel,
  rankChartGeometry,
  rankDomain,
  rankStep,
  CHART_HEIGHT,
  PAD_LEFT,
} from '../rankChartGeometry'
import type { RankPoint } from '../rankHistoryContent'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 7, 1)

describe('rankDomain', () => {
  it('pads a level that never moved out to three rows', () => {
    expect(rankDomain(5, 5)).toMatchObject({ top: 4, bottom: 6 })
  })

  it('takes the third row from below when the level sits at #1', () => {
    // Nothing ranks above #1, so the padding is one-sided rather than absent,
    // and the scale keeps half a rank of headroom so the line is not drawn
    // along the frame.
    expect(rankDomain(1, 1)).toMatchObject({ top: 1, bottom: 3 })
    expect(rankDomain(1, 1).scaleTop).toBeLessThan(1)
  })

  it('pads a short swing by one rank each way', () => {
    expect(rankDomain(3, 12)).toMatchObject({ top: 2, bottom: 13 })
  })

  it('pads a long swing proportionally', () => {
    // One rank of padding on a fifty-rank swing is two pixels, which reads as
    // no padding at all.
    expect(rankDomain(12, 62)).toMatchObject({ top: 7, bottom: 67 })
  })

  it('never runs the axis above #1', () => {
    expect(rankDomain(1, 8).top).toBe(1)
  })
})

describe('rankStep', () => {
  it('steps by whole ranks only', () => {
    for (const span of [2, 9, 39, 140, 900]) {
      expect(Number.isInteger(rankStep(span))).toBe(true)
    }
  })

  it('labels every rank on a small span', () => {
    expect(rankStep(2)).toBe(1)
    expect(rankStep(5)).toBe(1)
  })

  it('widens the step rather than crowding the axis', () => {
    expect(rankStep(9)).toBe(2)
    expect(rankStep(39)).toBe(10)
  })
})

describe('axisDateLabel', () => {
  it('follows the field order preference', () => {
    const time = Date.UTC(2026, 2, 14, 12)
    expect(axisDateLabel(time, 'MDY', 10 * DAY)).toBe('3/14')
    expect(axisDateLabel(time, 'DMY', 10 * DAY)).toBe('14/3')
    expect(axisDateLabel(time, 'ISO', 10 * DAY)).toBe('03-14')
  })

  it('drops to months, then years, as the window widens', () => {
    const time = Date.UTC(2026, 2, 14, 12)
    expect(axisDateLabel(time, 'MDY', 200 * DAY)).toBe('03/2026')
    expect(axisDateLabel(time, 'ISO', 200 * DAY)).toBe('2026-03')
    expect(axisDateLabel(time, 'MDY', 800 * DAY)).toBe('2026')
  })
})

describe('rankChartGeometry', () => {
  const flat: RankPoint[] = [
    { time: T0, position: 5 },
    { time: T0 + 30 * DAY, position: 5 },
  ]

  it('gives a level that never moved three labelled rank rows', () => {
    const geometry = rankChartGeometry(flat, 400, 'MDY')!
    expect(geometry.rankTicks.map((tick) => tick.position)).toEqual([4, 5, 6])
  })

  it('puts the better rank at the top of the plot', () => {
    const geometry = rankChartGeometry(
      [
        { time: T0, position: 12 },
        { time: T0 + DAY, position: 3 },
      ],
      400,
      'MDY'
    )!
    const [first, second] = geometry.dots
    // #3 is the better position, so it sits higher — a smaller y.
    expect(second!.y).toBeLessThan(first!.y)
  })

  it('keeps the plot clear of the label gutters', () => {
    const geometry = rankChartGeometry(flat, 400, 'MDY')!
    expect(geometry.plot.x).toBe(PAD_LEFT)
    expect(geometry.plot.y + geometry.plot.height).toBeLessThan(CHART_HEIGHT)
    for (const dot of geometry.dots) {
      expect(dot.x).toBeGreaterThanOrEqual(geometry.plot.x)
      expect(dot.x).toBeLessThanOrEqual(geometry.plot.x + geometry.plot.width)
    }
  })

  it('labels a held rank once, where it was reached', () => {
    const geometry = rankChartGeometry(flat, 400, 'MDY')!
    // Both ends of the flat run get a dot — the run's extent is the point —
    // but "#5" is one fact and is written once.
    expect(geometry.dots).toHaveLength(2)
    expect(geometry.dots.map((dot) => dot.label)).toEqual(['#5', null])
  })

  it('labels each move rather than each dot', () => {
    const geometry = rankChartGeometry(
      [
        { time: T0, position: 12 },
        { time: T0 + 5 * DAY, position: 12 },
        { time: T0 + 5 * DAY, position: 7 },
        { time: T0 + 30 * DAY, position: 7 },
      ],
      400,
      'MDY'
    )!
    expect(
      geometry.dots.filter((dot) => dot.label !== null).map((dot) => dot.label)
    ).toEqual(['#12', '#7'])
  })

  it('drops a label rather than stacking two on top of each other', () => {
    // A one-rank move on a long list: the two dots share a timestamp (the
    // position before the move and the position after it) and the axis spans
    // sixty ranks, so the two labels want the same few pixels.
    const crowded: RankPoint[] = [
      { time: T0, position: 60 },
      { time: T0 + 5 * DAY, position: 1 },
      { time: T0 + 10 * DAY, position: 31 },
      { time: T0 + 10 * DAY, position: 30 },
      { time: T0 + 15 * DAY, position: 30 },
    ]
    const geometry = rankChartGeometry(crowded, 300, 'MDY')!
    const labelled = geometry.dots.filter((dot) => dot.label !== null)
    // #31 and #30 want the same few pixels; only one of them gets them, and
    // the most recent move is the one that wins.
    expect(labelled.map((dot) => dot.label)).toContain('#30')
    expect(labelled.map((dot) => dot.label)).not.toContain('#31')
    // And every dot can still be read individually.
    for (const dot of geometry.dots) {
      expect(dot.title).toContain(`#${dot.position}`)
    }
  })

  it('breaks the line where the level left the ranking', () => {
    const geometry = rankChartGeometry(
      [
        { time: T0, position: 4 },
        { time: T0 + DAY, position: null },
        { time: T0 + 2 * DAY, position: 9 },
      ],
      400,
      'MDY'
    )!
    expect(geometry.segments).toHaveLength(2)
  })

  it('draws the series as steps, never as a diagonal', () => {
    const geometry = rankChartGeometry(
      [
        { time: T0, position: 4 },
        { time: T0 + DAY, position: 9 },
      ],
      400,
      'MDY'
    )!
    // H then V — a diagonal would be an L or a second pair of coordinates on
    // the M, and would draw a slide between two ranks that never happened.
    expect(geometry.segments[0]).toMatch(/^M [\d.]+ [\d.]+ H [\d.]+ V [\d.]+$/)
  })

  it('centres a single-moment series rather than dividing by a zero span', () => {
    const geometry = rankChartGeometry([{ time: T0, position: 6 }], 400, 'MDY')!
    expect(geometry.dots[0]!.x).toBe(geometry.plot.x + geometry.plot.width / 2)
    expect(geometry.timeTicks).toHaveLength(1)
  })

  it('has nothing to draw when no point is ranked', () => {
    expect(
      rankChartGeometry([{ time: T0, position: null }], 400, 'MDY')
    ).toBeNull()
    expect(rankChartGeometry([], 400, 'MDY')).toBeNull()
  })

  it('names the range in its accessible summary', () => {
    expect(rankChartGeometry(flat, 400, 'MDY')!.summary).toContain('#5')
    const moved = rankChartGeometry(
      [
        { time: T0, position: 12 },
        { time: T0 + DAY, position: 3 },
      ],
      400,
      'MDY'
    )!
    expect(moved.summary).toContain('#3')
    expect(moved.summary).toContain('#12')
  })
})
