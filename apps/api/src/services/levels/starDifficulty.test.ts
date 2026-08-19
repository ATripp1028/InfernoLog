// Covers the GD star scale in packages/core — the mapping the whole non-demon
// difficulty model rests on. Lives in apps/api (packages/core has no test setup
// of its own) alongside the write paths that depend on it.
//
// The property that matters most here is that the mapping is a SURJECTION: a
// count determines a face, a face does not determine a count. Several of these
// cases exist specifically to fail if someone "simplifies" it back to a 1:1.

import { describe, it, expect } from 'vitest'
import {
  starsToFace,
  faceToStarRange,
  faceMatchesStars,
  deriveInGameDifficulty,
  NON_DEMON_STAR_TIERS,
  MAX_NON_DEMON_STARS,
  DEMON_STARS,
} from '@infernolog/core'

describe('starsToFace', () => {
  it('maps each star count to its band’s face', () => {
    expect(starsToFace(1)).toBe('Auto')
    expect(starsToFace(2)).toBe('Easy')
    expect(starsToFace(3)).toBe('Normal')
    expect(starsToFace(4)).toBe('Hard')
    expect(starsToFace(5)).toBe('Hard')
    expect(starsToFace(6)).toBe('Harder')
    expect(starsToFace(7)).toBe('Harder')
    expect(starsToFace(8)).toBe('Insane')
    expect(starsToFace(9)).toBe('Insane')
  })

  // The whole scheme rests on this: a count in 1-9 is proof of a rated
  // non-demon, which is why deriveInGameDifficulty needs no isDemon flag.
  it('returns null outside the non-demon range', () => {
    expect(starsToFace(0)).toBeNull()
    expect(starsToFace(DEMON_STARS)).toBeNull()
    expect(starsToFace(11)).toBeNull()
    expect(starsToFace(null)).toBeNull()
  })
})

describe('faceToStarRange', () => {
  it('spans two counts for the banded faces', () => {
    expect(faceToStarRange('Hard')).toEqual({ min: 4, max: 5 })
    expect(faceToStarRange('Harder')).toEqual({ min: 6, max: 7 })
    expect(faceToStarRange('Insane')).toEqual({ min: 8, max: 9 })
  })

  it('spans one count for the single-count faces', () => {
    expect(faceToStarRange('Auto')).toEqual({ min: 1, max: 1 })
    expect(faceToStarRange('Easy')).toEqual({ min: 2, max: 2 })
    expect(faceToStarRange('Normal')).toEqual({ min: 3, max: 3 })
  })

  it('is case- and whitespace-insensitive for hand-typed labels', () => {
    expect(faceToStarRange('  harder ')).toEqual({ min: 6, max: 7 })
    expect(faceToStarRange('INSANE')).toEqual({ min: 8, max: 9 })
  })

  it('returns null for demon tiers, Unrated and junk', () => {
    expect(faceToStarRange('Extreme Demon')).toBeNull()
    expect(faceToStarRange('Easy Demon')).toBeNull()
    expect(faceToStarRange('Unrated')).toBeNull()
    expect(faceToStarRange('')).toBeNull()
    expect(faceToStarRange(null)).toBeNull()
  })
})

describe('the star/face mapping as a whole', () => {
  it('covers every count 1..9, each landing in its own face’s band', () => {
    expect(NON_DEMON_STAR_TIERS).toHaveLength(MAX_NON_DEMON_STARS)
    expect(NON_DEMON_STAR_TIERS.map((t) => t.stars)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
    for (const { stars, face } of NON_DEMON_STAR_TIERS) {
      expect(starsToFace(stars)).toBe(face)
      expect(faceMatchesStars(face, stars)).toBe(true)
    }
  })

  // Guards the surjection directly: fewer distinct faces than counts.
  it('has more counts than faces, so a face cannot identify a count', () => {
    const faces = new Set(NON_DEMON_STAR_TIERS.map((t) => t.face))
    expect(faces.size).toBeLessThan(NON_DEMON_STAR_TIERS.length)
    expect(starsToFace(4)).toBe(starsToFace(5))
  })
})

describe('faceMatchesStars', () => {
  it('accepts either count in a two-count band', () => {
    expect(faceMatchesStars('Hard', 4)).toBe(true)
    expect(faceMatchesStars('Hard', 5)).toBe(true)
  })

  it('rejects a count from a neighbouring band', () => {
    expect(faceMatchesStars('Hard', 3)).toBe(false)
    expect(faceMatchesStars('Hard', 6)).toBe(false)
  })

  it('rejects labels this scale does not cover', () => {
    expect(faceMatchesStars('Extreme Demon', 10)).toBe(false)
    expect(faceMatchesStars('Unrated', 1)).toBe(false)
    expect(faceMatchesStars(null, 4)).toBe(false)
  })
})

describe('deriveInGameDifficulty', () => {
  // The point of the precedence rule: `stars` is canonical for a non-demon, so
  // a label that drifted out of sync never reaches a client.
  it('lets the star count win over a disagreeing label', () => {
    expect(deriveInGameDifficulty({ stars: 8, inGameDifficulty: 'Hard' })).toBe(
      'Insane'
    )
  })

  it('agrees with the label when the two are in sync', () => {
    expect(deriveInGameDifficulty({ stars: 5, inGameDifficulty: 'Hard' })).toBe(
      'Hard'
    )
  })

  it('keeps the stored label for demons and unrated levels', () => {
    expect(
      deriveInGameDifficulty({
        stars: DEMON_STARS,
        inGameDifficulty: 'Extreme Demon',
      })
    ).toBe('Extreme Demon')
    expect(
      deriveInGameDifficulty({ stars: 0, inGameDifficulty: 'Unrated' })
    ).toBe('Unrated')
  })

  // Hand-added levels and un-enriched stubs can have a label but no count —
  // including every Hard/Harder/Insane row the backfill deliberately skipped.
  it('falls back to the stored label when the count is missing', () => {
    expect(
      deriveInGameDifficulty({ stars: null, inGameDifficulty: 'Harder' })
    ).toBe('Harder')
    expect(
      deriveInGameDifficulty({ stars: null, inGameDifficulty: null })
    ).toBeNull()
  })
})
