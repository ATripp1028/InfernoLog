import { describe, expect, it } from 'vitest'
import {
  FACE_REFERENCE_WIDTH,
  faceScale,
  glowOffset,
  glowScale,
  ratedStarPlacement,
} from '../faceGeometry'

const SIZES = [24, 36, 70, 120]

describe('faceScale', () => {
  // The whole point of a shared reference width: every crop comes out the same
  // on-screen size, so a demon-extreme's ball matches an Easy's.
  it('scales every face from the same reference', () => {
    expect(faceScale(160)).toBe((160 * 0.6) / FACE_REFERENCE_WIDTH)
  })

  it('leaves room around the face for the fire', () => {
    // 160px native × the scale should land at 60% of the box, not fill it.
    expect(FACE_REFERENCE_WIDTH * faceScale(100)).toBeCloseTo(60)
  })

  it.each(SIZES)('scales linearly with a %spx box', (size) => {
    expect(faceScale(size * 2)).toBeCloseTo(faceScale(size) * 2)
  })

  it('never inverts the sprite', () => {
    for (const size of SIZES) expect(faceScale(size)).toBeGreaterThan(0)
  })
})

describe('glowOffset', () => {
  // The fire extends further below the face than above, so seating the face
  // at the box's centre means nudging the glow down.
  it('pushes the glow below centre', () => {
    expect(glowOffset(70)).toBeGreaterThan(0)
  })

  it.each(SIZES)('scales with a %spx box', (size) => {
    expect(glowOffset(size)).toBe(Math.round(size * 0.08))
  })

  // Inline styles in px, so a fractional offset would land on a half-pixel.
  it('lands on a whole pixel', () => {
    for (const size of SIZES) {
      expect(Number.isInteger(glowOffset(size))).toBe(true)
    }
  })

  it('stays a small fraction of the box', () => {
    expect(glowOffset(70)).toBeLessThan(70 * 0.2)
  })
})

describe('glowScale', () => {
  // The feature-circle asset is drawn larger than the fires, so at full size
  // it overruns the face's horns.
  it('shrinks the feature circle', () => {
    expect(glowScale(0, true)).toBe(0.8)
  })

  it.each([
    ['epic', 1],
    ['legendary', 2],
    ['mythic', 3],
  ])('leaves the %s fire at full size', (_label, epicValue) => {
    expect(glowScale(epicValue, false)).toBe(1)
  })

  // An epic level is also flagged featured; the higher showcase decides, so
  // its fire must not get the feature circle's shrink.
  it('does not shrink an epic level that is also featured', () => {
    expect(glowScale(1, true)).toBe(1)
  })

  it('is harmless for a level with no glow at all', () => {
    expect(glowScale(0, false)).toBe(1)
  })
})

describe('ratedStarPlacement', () => {
  it('tucks the badge into the bottom-right corner', () => {
    const { bottom, right } = ratedStarPlacement(70)

    expect(bottom).toBeGreaterThan(0)
    expect(right).toBeGreaterThan(0)
  })

  it('keeps the badge smaller than the face', () => {
    for (const size of SIZES) {
      expect(ratedStarPlacement(size).width).toBeLessThan(size * 0.5)
    }
  })

  it.each(SIZES)('scales with a %spx box', (size) => {
    expect(ratedStarPlacement(size)).toEqual({
      width: Math.round(size * 0.2),
      bottom: Math.round(size * 0.25),
      right: Math.round(size * 0.25),
    })
  })

  it('lands on whole pixels', () => {
    for (const size of SIZES) {
      for (const v of Object.values(ratedStarPlacement(size))) {
        expect(Number.isInteger(v)).toBe(true)
      }
    }
  })

  // Inset far enough that the badge does not hang off the box.
  it('keeps the badge inside the box', () => {
    const { width, right } = ratedStarPlacement(70)

    expect(width + right).toBeLessThan(70)
  })
})
