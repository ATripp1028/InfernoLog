import { describe, expect, it } from 'vitest'
import { overallColor, ratingRampColor, scoreColor } from '../ratingColor'

const GOLD = '#ffd43b'
const CRIMSON = '#dc143c'

describe('ratingRampColor', () => {
  it('gives an unrated value no colour at all', () => {
    expect(ratingRampColor(null)).toBeUndefined()
  })

  it('is white in the middle', () => {
    expect(ratingRampColor(50)).toBe('rgb(255, 255, 255)')
  })

  it('ramps red to white below the middle', () => {
    // Halfway from #f8696b to white.
    expect(ratingRampColor(25)).toBe('rgb(252, 180, 181)')
  })

  it('ramps white to green above the middle', () => {
    // Halfway from white to #63be7b.
    expect(ratingRampColor(75)).toBe('rgb(177, 223, 189)')
  })

  // No position to judge by means no extremes — this is what the editor's live
  // preview uses while the rank it will land at is still in flux.
  it('applies no exceptions of its own', () => {
    expect(ratingRampColor(100)).not.toBe(GOLD)
    expect(ratingRampColor(0)).not.toBe(CRIMSON)
  })
})

describe('scoreColor', () => {
  // A category score is typed directly, so a flat 10 or 0 is a real thing to
  // land on and worth marking.
  it('marks a flat top score gold and a flat zero crimson', () => {
    expect(scoreColor(100)).toBe(GOLD)
    expect(scoreColor(0)).toBe(CRIMSON)
  })

  it('returns to the gradient either side of the exceptions', () => {
    expect(scoreColor(99)).toBe(ratingRampColor(99))
    expect(scoreColor(1)).toBe(ratingRampColor(1))
  })

  it('gives an unscored category no colour', () => {
    expect(scoreColor(null)).toBeUndefined()
  })
})

describe('overallColor', () => {
  // A weighted average reaches a flat 10 or 0 only if every category agrees, so
  // the extremes are anchored to the ranking instead of to the scale.
  it('marks the top of the ranking gold whatever the rating', () => {
    expect(overallColor(62, 1, 10)).toBe(GOLD)
  })

  it('marks the bottom of the ranking crimson whatever the rating', () => {
    expect(overallColor(84, 10, 10)).toBe(CRIMSON)
  })

  it('leaves everything between on the gradient', () => {
    expect(overallColor(100, 5, 10)).toBe(ratingRampColor(100))
    expect(overallColor(0, 5, 10)).toBe(ratingRampColor(0))
  })

  // A solitary entry is the user's best before it is their worst.
  it('prefers gold when the only level is both first and last', () => {
    expect(overallColor(50, 1, 1)).toBe(GOLD)
  })

  it('gives an unrated level no colour', () => {
    expect(overallColor(null, 1, 10)).toBeUndefined()
  })
})
