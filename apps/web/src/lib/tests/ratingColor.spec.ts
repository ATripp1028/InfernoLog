import { describe, expect, it } from 'vitest'
import { ratingColor } from '../ratingColor'

describe('ratingColor', () => {
  // No rating is not a bad rating — the caller's own text colour stands.
  it('gives an unrated value no colour at all', () => {
    expect(ratingColor(null)).toBeUndefined()
  })

  it('marks a perfect score gold', () => {
    expect(ratingColor(100)).toBe('#ffd43b')
  })

  it('marks an outright zero crimson', () => {
    expect(ratingColor(0)).toBe('#dc143c')
  })

  // The two exceptions are lifted out of the ramp, so the value just inside
  // each end is the gradient's own stop rather than the exception colour.
  it('returns to the gradient either side of the exceptions', () => {
    expect(ratingColor(1)).not.toBe('#dc143c')
    expect(ratingColor(99)).not.toBe('#ffd43b')
  })

  it('is white in the middle', () => {
    expect(ratingColor(50)).toBe('rgb(255, 255, 255)')
  })

  it('ramps red to white below the middle', () => {
    // Halfway from #f8696b to white.
    expect(ratingColor(25)).toBe('rgb(252, 180, 181)')
  })

  it('ramps white to green above the middle', () => {
    // Halfway from white to #63be7b.
    expect(ratingColor(75)).toBe('rgb(177, 223, 189)')
  })

  // A weighted average can round a hair past the top of the scale; that should
  // read as perfect rather than wrap round the ramp.
  it('clamps outside the scale', () => {
    expect(ratingColor(100.4)).toBe('#ffd43b')
    expect(ratingColor(-3)).toBe('#dc143c')
  })
})
