// The scroll → ember-field mapping: how far down the page translates into a
// background colour, a population, and a drift speed, plus the per-ember
// spawn and step. Pure — EmberBackground owns the canvas, the listeners, and
// the rAF loop, and paints whatever these return.
//
// See docs/DESIGN_LANGUAGE.md § Ember Background System.

/** The four ember tints, sampled at random on spawn. */
export const EMBER_COLORS = ['#e8390e', '#ff9f1c', '#ff6b35', '#ff4d1f']

/** Background interpolation endpoints — base dark → warm dark, "fire intensifying". */
export const BG_BASE = { r: 0x0d, g: 0x0d, b: 0x0d } // #0d0d0d
export const BG_WARM = { r: 0x3a, g: 0x15, b: 0x08 } // #3a1508

/** Ember population at the top of the page, and the ceiling at the bottom. */
export const COUNT_MIN = 20
export const COUNT_MAX_DESKTOP = 70
export const COUNT_MAX_MOBILE = 35

/** Drift-speed multiplier at the top and bottom of the page. */
export const SPEED_MIN = 1
export const SPEED_MAX = 2.2

/** Below this viewport width the field is halved. */
export const MOBILE_BREAKPOINT = 768

/**
 * One drifting ember.
 */
export interface Ember {
  x: number
  y: number
  size: number
  drift: number // horizontal wander amplitude (px)
  driftPhase: number
  driftSpeed: number
  rise: number // base upward speed (px/frame at 1x)
  baseOpacity: number
  flickerPhase: number
  flickerSpeed: number
  color: string
}

/**
 * Linear interpolation between `a` and `b`.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * How far down the page the visitor is, as 0–1.
 *
 * Clamped, and answers 0 for a page too short to scroll — dividing by a zero
 * scrollable height would otherwise produce NaN and poison every value below.
 */
export function scrollFraction(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const max = scrollHeight - clientHeight
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, scrollTop / max))
}

/**
 * The most embers this viewport carries. Mobile gets half the desktop ceiling.
 */
export function emberCeiling(width: number): number {
  return width < MOBILE_BREAKPOINT ? COUNT_MAX_MOBILE : COUNT_MAX_DESKTOP
}

/**
 * How many embers should be alive at this scroll position.
 */
export function emberCount(fraction: number, ceiling: number): number {
  return Math.round(lerp(COUNT_MIN, ceiling, fraction))
}

/**
 * The drift-speed multiplier at this scroll position.
 */
export function emberSpeed(fraction: number): number {
  return lerp(SPEED_MIN, SPEED_MAX, fraction)
}

/**
 * The background colour at this scroll position, as a CSS `rgb()` string.
 */
export function backgroundColor(fraction: number): string {
  const r = Math.round(lerp(BG_BASE.r, BG_WARM.r, fraction))
  const g = Math.round(lerp(BG_BASE.g, BG_WARM.g, fraction))
  const b = Math.round(lerp(BG_BASE.b, BG_WARM.b, fraction))
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * A new ember somewhere in the viewport, or just below it.
 *
 * @param atBottom - True to spawn off the bottom edge, so it drifts in rather
 * than popping into view mid-screen. False scatters it anywhere vertically,
 * which is how the initial field is seeded.
 * @param rand - Injectable randomness, so the ranges are testable.
 */
export function spawnEmber(
  width: number,
  height: number,
  atBottom: boolean,
  rand: () => number = Math.random
): Ember {
  return {
    x: rand() * width,
    y: atBottom ? height + rand() * 40 : rand() * height,
    size: 1 + rand() * 2.5,
    drift: 8 + rand() * 22,
    driftPhase: rand() * Math.PI * 2,
    driftSpeed: 0.005 + rand() * 0.02,
    rise: 0.3 + rand() * 0.8,
    baseOpacity: 0.3 + rand() * 0.5,
    flickerPhase: rand() * Math.PI * 2,
    flickerSpeed: 0.02 + rand() * 0.06,
    color: EMBER_COLORS[Math.floor(rand() * EMBER_COLORS.length)] ?? '#ff6b35',
  }
}

/**
 * Advances one ember by a frame, in place.
 *
 * An ember that has risen off the top is recycled to the bottom at a fresh
 * horizontal position rather than allocated anew — the field's size is
 * governed by {@link emberCount}, not by churn.
 */
export function stepEmber(
  e: Ember,
  speed: number,
  width: number,
  height: number,
  rand: () => number = Math.random
): void {
  e.y -= e.rise * speed
  e.driftPhase += e.driftSpeed
  e.flickerPhase += e.flickerSpeed
  if (e.y < -10) {
    e.y = height + rand() * 40
    e.x = rand() * width
  }
}

/**
 * An ember's current opacity, flickering around its base.
 */
export function emberOpacity(e: Ember): number {
  return e.baseOpacity * (0.65 + 0.35 * Math.sin(e.flickerPhase))
}

/**
 * Where an ember is drawn horizontally — its position plus the drift wobble.
 */
export function emberX(e: Ember): number {
  return e.x + Math.sin(e.driftPhase) * e.drift
}
