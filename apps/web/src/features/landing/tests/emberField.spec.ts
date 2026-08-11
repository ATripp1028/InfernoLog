import { describe, expect, it } from 'vitest'
import {
  BG_BASE,
  BG_WARM,
  COUNT_MAX_DESKTOP,
  COUNT_MAX_MOBILE,
  COUNT_MIN,
  EMBER_COLORS,
  MOBILE_BREAKPOINT,
  SPEED_MAX,
  SPEED_MIN,
  backgroundColor,
  emberCeiling,
  emberCount,
  emberOpacity,
  emberSpeed,
  emberX,
  lerp,
  scrollFraction,
  spawnEmber,
  stepEmber,
  type Ember,
} from '../emberField'

/** A deterministic stand-in for Math.random, cycling the given values. */
const randomOf = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('lerp', () => {
  it.each([
    [0, 10],
    [0.5, 15],
    [1, 20],
  ])('interpolates to %s of the way as %s', (t, expected) => {
    expect(lerp(10, 20, t)).toBe(expected)
  })

  it('interpolates downwards too', () => {
    expect(lerp(20, 10, 0.5)).toBe(15)
  })
})

describe('scrollFraction', () => {
  it('reports the top of the page as zero', () => {
    expect(scrollFraction(0, 2000, 1000)).toBe(0)
  })

  it('reports the bottom as one', () => {
    expect(scrollFraction(1000, 2000, 1000)).toBe(1)
  })

  it('reports the midpoint as a half', () => {
    expect(scrollFraction(500, 2000, 1000)).toBe(0.5)
  })

  // Overscroll — rubber-banding on iOS, say — must not push the field past
  // its endpoints.
  it.each([
    ['past the bottom', 5000, 1],
    ['above the top', -200, 0],
  ])('clamps a scroll position %s', (_label, scrollTop, expected) => {
    expect(scrollFraction(scrollTop, 2000, 1000)).toBe(expected)
  })

  // A page too short to scroll has a zero scrollable height; dividing by it
  // would produce NaN and poison every value downstream.
  it.each([
    ['a page that exactly fits', 1000, 1000],
    ['a viewport taller than the page', 500, 1000],
  ])('reports zero for %s', (_label, scrollHeight, clientHeight) => {
    const result = scrollFraction(0, scrollHeight, clientHeight)

    expect(result).toBe(0)
    expect(Number.isNaN(result)).toBe(false)
  })
})

describe('emberCeiling', () => {
  it('gives a desktop viewport the full ceiling', () => {
    expect(emberCeiling(1920)).toBe(COUNT_MAX_DESKTOP)
  })

  it('halves the ceiling below the mobile breakpoint', () => {
    expect(emberCeiling(390)).toBe(COUNT_MAX_MOBILE)
  })

  // The breakpoint itself is desktop — `<`, not `<=`.
  it('treats the breakpoint width itself as desktop', () => {
    expect(emberCeiling(MOBILE_BREAKPOINT)).toBe(COUNT_MAX_DESKTOP)
    expect(emberCeiling(MOBILE_BREAKPOINT - 1)).toBe(COUNT_MAX_MOBILE)
  })

  it('keeps the mobile ceiling below the desktop one', () => {
    expect(COUNT_MAX_MOBILE).toBeLessThan(COUNT_MAX_DESKTOP)
  })
})

describe('emberCount', () => {
  it('starts at the minimum population at the top of the page', () => {
    expect(emberCount(0, COUNT_MAX_DESKTOP)).toBe(COUNT_MIN)
  })

  it('reaches the ceiling at the bottom', () => {
    expect(emberCount(1, COUNT_MAX_DESKTOP)).toBe(COUNT_MAX_DESKTOP)
  })

  it('grows through the middle', () => {
    const mid = emberCount(0.5, COUNT_MAX_DESKTOP)

    expect(mid).toBeGreaterThan(COUNT_MIN)
    expect(mid).toBeLessThan(COUNT_MAX_DESKTOP)
  })

  // The count indexes an array, so a fractional value would be meaningless.
  it('is always a whole number', () => {
    for (const f of [0.1, 0.33, 0.5, 0.77, 0.9]) {
      expect(Number.isInteger(emberCount(f, COUNT_MAX_DESKTOP))).toBe(true)
    }
  })

  it('never drops below the minimum, whatever the ceiling', () => {
    expect(emberCount(0, COUNT_MAX_MOBILE)).toBe(COUNT_MIN)
  })

  it('honours the mobile ceiling', () => {
    expect(emberCount(1, COUNT_MAX_MOBILE)).toBe(COUNT_MAX_MOBILE)
  })

  it('grows monotonically down the page', () => {
    const counts = [0, 0.25, 0.5, 0.75, 1].map((f) =>
      emberCount(f, COUNT_MAX_DESKTOP)
    )

    expect(counts).toEqual([...counts].sort((a, b) => a - b))
  })
})

describe('emberSpeed', () => {
  it('starts at the base speed', () => {
    expect(emberSpeed(0)).toBe(SPEED_MIN)
  })

  it('reaches the maximum at the bottom', () => {
    expect(emberSpeed(1)).toBe(SPEED_MAX)
  })

  it('accelerates monotonically down the page', () => {
    const speeds = [0, 0.25, 0.5, 0.75, 1].map(emberSpeed)

    expect(speeds).toEqual([...speeds].sort((a, b) => a - b))
  })
})

describe('backgroundColor', () => {
  const rgb = (fraction: number) =>
    backgroundColor(fraction).match(/\d+/g)!.map(Number) as [
      number,
      number,
      number,
    ]

  it('renders an rgb() string', () => {
    expect(backgroundColor(0.5)).toMatch(/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/)
  })

  it('starts at the base colour', () => {
    expect(rgb(0)).toEqual([BG_BASE.r, BG_BASE.g, BG_BASE.b])
  })

  it('reaches the warm colour at the bottom', () => {
    expect(rgb(1)).toEqual([BG_WARM.r, BG_WARM.g, BG_WARM.b])
  })

  it('interpolates between the two through the middle', () => {
    const [r] = rgb(0.5)

    expect(r).toBeGreaterThan(BG_BASE.r)
    expect(r).toBeLessThan(BG_WARM.r)
  })

  // Fractional channel values would produce an invalid CSS colour.
  it('produces integer channels', () => {
    for (const channel of rgb(0.37)) {
      expect(Number.isInteger(channel)).toBe(true)
    }
  })

  // "Fire intensifying": the page warms as you scroll, so red rises while
  // green and blue stay low.
  it('warms rather than merely brightening', () => {
    const [r, g, b] = rgb(1)

    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })
})

describe('spawnEmber', () => {
  // Every field is a base plus a random span, so a rand of 0 gives the floor
  // and a rand approaching 1 gives the ceiling.
  it('places every value at its floor for a zero random source', () => {
    const e = spawnEmber(1000, 800, false, randomOf(0))

    expect(e).toMatchObject({
      x: 0,
      y: 0,
      size: 1,
      drift: 8,
      driftPhase: 0,
      driftSpeed: 0.005,
      rise: 0.3,
      baseOpacity: 0.3,
      flickerPhase: 0,
      flickerSpeed: 0.02,
    })
  })

  it('keeps every value inside its range for a random source at the top', () => {
    const e = spawnEmber(1000, 800, false, randomOf(0.999999))

    expect(e.size).toBeLessThanOrEqual(3.5)
    expect(e.drift).toBeLessThanOrEqual(30)
    expect(e.rise).toBeLessThanOrEqual(1.1)
    expect(e.baseOpacity).toBeLessThanOrEqual(0.8)
  })

  // Opacity has to stay in 0–1 or the canvas clamps it and the flicker reads
  // wrong at the extremes.
  it('never spawns an opacity outside what the canvas can draw', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const e = spawnEmber(1000, 800, false, randomOf(r))

      expect(e.baseOpacity).toBeGreaterThan(0)
      expect(e.baseOpacity).toBeLessThanOrEqual(1)
    }
  })

  it('scatters an initial ember anywhere in the viewport', () => {
    const top = spawnEmber(1000, 800, false, randomOf(0))
    const bottom = spawnEmber(1000, 800, false, randomOf(0.999999))

    expect(top.y).toBe(0)
    expect(bottom.y).toBeLessThanOrEqual(800)
  })

  // A recycled ember starts below the viewport so it drifts in rather than
  // popping into view mid-screen.
  it('spawns below the viewport when recycling', () => {
    const e = spawnEmber(1000, 800, true, randomOf(0))

    expect(e.y).toBeGreaterThanOrEqual(800)
  })

  it('picks a colour from the palette', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(EMBER_COLORS).toContain(
        spawnEmber(1000, 800, false, randomOf(r)).color
      )
    }
  })

  // Math.floor(rand() * length) is length only when rand() returns exactly 1,
  // which it never should — but the fallback keeps a bad source from
  // producing an undefined fill style.
  it('falls back to a real colour rather than undefined', () => {
    const e = spawnEmber(1000, 800, false, () => 1)

    expect(typeof e.color).toBe('string')
    expect(e.color.length).toBeGreaterThan(0)
  })
})

describe('stepEmber', () => {
  const ember = (overrides: Partial<Ember> = {}): Ember => ({
    x: 500,
    y: 400,
    size: 2,
    drift: 10,
    driftPhase: 0,
    driftSpeed: 0.01,
    rise: 0.5,
    baseOpacity: 0.5,
    flickerPhase: 0,
    flickerSpeed: 0.03,
    color: '#ff6b35',
    ...overrides,
  })

  it('rises by its own speed times the field speed', () => {
    const e = ember({ y: 400, rise: 0.5 })

    stepEmber(e, 2, 1000, 800)

    expect(e.y).toBe(399)
  })

  it('advances both wobble phases', () => {
    const e = ember({ driftPhase: 0, flickerPhase: 0 })

    stepEmber(e, 1, 1000, 800)

    expect(e.driftPhase).toBe(0.01)
    expect(e.flickerPhase).toBe(0.03)
  })

  // Recycling rather than reallocating: the population is governed by
  // emberCount, not by churn.
  it('recycles an ember that has risen off the top', () => {
    const e = ember({ y: -11 })

    stepEmber(e, 1, 1000, 800, randomOf(0))

    expect(e.y).toBeGreaterThanOrEqual(800)
  })

  it('gives a recycled ember a fresh horizontal position', () => {
    const e = ember({ x: 500, y: -11 })

    // rand is consumed for y first, then x — so x lands at 0.25 * width.
    stepEmber(e, 1, 1000, 800, randomOf(0, 0.25))

    expect(e.x).toBe(250)
  })

  // The threshold is below zero, so an ember only recycles once it is fully
  // clear of the top edge rather than while still partly visible.
  it('leaves an ember still touching the top edge alone', () => {
    const e = ember({ y: -5 })

    stepEmber(e, 1, 1000, 800)

    expect(e.y).toBeLessThan(0)
    expect(e.y).toBeGreaterThan(-10)
  })

  it('moves nothing sideways on an ordinary step', () => {
    const e = ember({ x: 500, y: 400 })

    stepEmber(e, 1, 1000, 800)

    expect(e.x).toBe(500)
  })
})

describe('emberOpacity', () => {
  // The flicker rides around the ember's base opacity rather than replacing
  // it, so a dim ember stays dim.
  it('brightens and dims around the base opacity', () => {
    const base = 0.5
    const samples = [0, 1, 2, 3, 4].map((phase) =>
      emberOpacity({ baseOpacity: base, flickerPhase: phase } as Ember)
    )

    expect(Math.max(...samples)).toBeGreaterThan(base * 0.7)
    expect(Math.min(...samples)).toBeLessThan(base)
  })

  it('never goes negative or exceeds the base', () => {
    for (let phase = 0; phase < 10; phase += 0.5) {
      const opacity = emberOpacity({
        baseOpacity: 0.8,
        flickerPhase: phase,
      } as Ember)

      expect(opacity).toBeGreaterThan(0)
      expect(opacity).toBeLessThanOrEqual(0.8)
    }
  })

  it('scales with the base opacity', () => {
    const dim = emberOpacity({ baseOpacity: 0.2, flickerPhase: 0 } as Ember)
    const bright = emberOpacity({ baseOpacity: 0.8, flickerPhase: 0 } as Ember)

    expect(bright).toBeGreaterThan(dim)
  })
})

describe('emberX', () => {
  it('sits at its own position when the wobble is at zero', () => {
    expect(emberX({ x: 500, driftPhase: 0, drift: 20 } as Ember)).toBe(500)
  })

  it('wanders no further than its drift amplitude', () => {
    for (let phase = 0; phase < 7; phase += 0.25) {
      const x = emberX({ x: 500, driftPhase: phase, drift: 20 } as Ember)

      expect(Math.abs(x - 500)).toBeLessThanOrEqual(20)
    }
  })

  it('wanders both ways', () => {
    const right = emberX({
      x: 500,
      driftPhase: Math.PI / 2,
      drift: 20,
    } as Ember)
    const left = emberX({
      x: 500,
      driftPhase: (3 * Math.PI) / 2,
      drift: 20,
    } as Ember)

    expect(right).toBeGreaterThan(500)
    expect(left).toBeLessThan(500)
  })
})
