// Guards the official-level exemption to the star-precedence rule.
//
// This exists because the rule genuinely broke on real data: 11 of the 38
// seeded official levels have a star count that contradicts their difficulty
// face, since RobTop assigned main levels bespoke awards (1-15) rather than
// following the 4-5 Hard / 6-7 Harder / 8-9 Insane bands user levels use.

import { describe, it, expect } from 'vitest'
import { starsToFace } from '@infernolog/core'
import { resolveLevelDifficulty } from './difficulty'
import { OFFICIAL_LEVELS } from '../../data/officialLevels'

describe('resolveLevelDifficulty — official levels', () => {
  // The one that matters: every official level must serialize the difficulty
  // it was seeded with, whatever its star count implies.
  it('serializes each official level with its seeded difficulty', () => {
    for (const level of OFFICIAL_LEVELS) {
      expect(
        resolveLevelDifficulty({
          inGameId: level.inGameId,
          stars: level.stars,
          inGameDifficulty: level.inGameDifficulty,
        })
      ).toBe(level.inGameDifficulty)
    }
  })

  // Proves the exemption is load-bearing rather than a no-op: without it these
  // rows would serialize a different face than the one they were seeded with.
  it('covers official levels the banding would have gotten wrong', () => {
    const contradicting = OFFICIAL_LEVELS.filter((l) => {
      const banded = starsToFace(l.stars)
      return banded != null && banded !== l.inGameDifficulty
    })
    expect(contradicting.length).toBeGreaterThan(0)

    // e.g. Time Machine: 8 stars would band to Insane, but it is Harder.
    const timeMachine = OFFICIAL_LEVELS.find((l) => l.name === 'Time Machine')
    expect(timeMachine).toBeDefined()
    expect(starsToFace(timeMachine!.stars)).toBe('Insane')
    expect(
      resolveLevelDifficulty({
        inGameId: timeMachine!.inGameId,
        stars: timeMachine!.stars,
        inGameDifficulty: timeMachine!.inGameDifficulty,
      })
    ).toBe('Harder')
  })
})

describe('resolveLevelDifficulty — ordinary levels', () => {
  // Any id outside the official set follows RobTop's rating system, so the
  // star count stays canonical there.
  const userLevelId = '128512358'

  it('lets the star count win over a stale label', () => {
    expect(
      resolveLevelDifficulty({
        inGameId: userLevelId,
        stars: 8,
        inGameDifficulty: 'Hard',
      })
    ).toBe('Insane')
  })

  it('falls back to the label when there is no usable count', () => {
    expect(
      resolveLevelDifficulty({
        inGameId: userLevelId,
        stars: 10,
        inGameDifficulty: 'Extreme Demon',
      })
    ).toBe('Extreme Demon')
    expect(
      resolveLevelDifficulty({
        inGameId: userLevelId,
        stars: null,
        inGameDifficulty: 'Harder',
      })
    ).toBe('Harder')
  })
})
