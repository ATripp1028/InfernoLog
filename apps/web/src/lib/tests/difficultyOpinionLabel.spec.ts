import { describe, expect, it } from 'vitest'
import {
  opinionDifficulty,
  opinionLabel,
  opinionShortLabel,
} from '../difficultyOpinionLabel'
import { difficultyFaceSrc } from '../gdAssets'

describe('opinionLabel', () => {
  it('names a demon tier', () => {
    expect(opinionLabel('EXTREME')).toBe('Extreme')
  })

  it('spells out the disagreement answer', () => {
    expect(opinionLabel('NOT_DEMON_WORTHY')).toBe('Not demon-worthy')
  })

  it('falls back to the raw value', () => {
    expect(opinionLabel('IMPOSSIBLE')).toBe('IMPOSSIBLE')
  })

  // The nine star values (AUTO..NINE_STAR) were collapsed into
  // NOT_DEMON_WORTHY by the collapse_not_demon_worthy migration, so nothing
  // should still be storing one. A cached or exported copy that is renders as
  // itself rather than as blank.
  it('falls back for a collapsed star value', () => {
    expect(opinionLabel('NINE_STAR')).toBe('NINE_STAR')
  })
})

describe('opinionDifficulty', () => {
  it.each([
    ['EASY', 'Easy Demon'],
    ['MEDIUM', 'Medium Demon'],
    ['HARD', 'Hard Demon'],
    ['INSANE', 'Insane Demon'],
    ['EXTREME', 'Extreme Demon'],
  ])('maps %s to the %s face', (opinion, expected) => {
    expect(opinionDifficulty(opinion)).toBe(expected)
  })

  // The point of returning the asset-keyed label: every tier has a face, and
  // none of them fall through to the NA one.
  it('names a real face for every tier', () => {
    for (const opinion of ['EASY', 'MEDIUM', 'HARD', 'INSANE', 'EXTREME']) {
      const difficulty = opinionDifficulty(opinion)
      expect(difficulty).not.toBeNull()
      expect(difficultyFaceSrc(difficulty)).not.toContain('difficulty-na')
    }
  })

  // "Not demon-worthy" asserts no difficulty of its own — it says only that the
  // level should not have been a demon — so it gets no face rather than the NA
  // one dressed up as an answer.
  it('has no face for the disagreement answer', () => {
    expect(opinionDifficulty('NOT_DEMON_WORTHY')).toBeNull()
  })

  it('has no face for an unrecognised value', () => {
    expect(opinionDifficulty('IMPOSSIBLE')).toBeNull()
  })
})

describe('opinionShortLabel', () => {
  it('reads the same as the long label for the disagreement answer', () => {
    expect(opinionShortLabel('NOT_DEMON_WORTHY')).toBe('Not demon-worthy')
  })

  it('reads as the tier for a demon answer', () => {
    expect(opinionShortLabel('MEDIUM')).toBe('Medium')
  })

  it('falls back to the raw value', () => {
    expect(opinionShortLabel('IMPOSSIBLE')).toBe('IMPOSSIBLE')
  })
})
