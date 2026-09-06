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

  it('spells out a non-demon answer', () => {
    expect(opinionLabel('NINE_STAR')).toBe('Not demon-worthy · 9★ Insane')
  })

  it('falls back to the raw value', () => {
    expect(opinionLabel('IMPOSSIBLE')).toBe('IMPOSSIBLE')
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

  it.each([
    ['AUTO', 'Auto'],
    ['FIVE_STAR', 'Hard'],
    ['NINE_STAR', 'Insane'],
  ])('maps the non-demon %s to %s', (opinion, expected) => {
    expect(opinionDifficulty(opinion)).toBe(expected)
  })

  // The point of returning the asset-keyed label: every value has a face, and
  // none of them fall through to the NA one.
  it('names a real face for every answer', () => {
    for (const opinion of ['EASY', 'EXTREME', 'AUTO', 'NINE_STAR']) {
      const difficulty = opinionDifficulty(opinion)
      expect(difficulty).not.toBeNull()
      expect(difficultyFaceSrc(difficulty)).not.toContain('difficulty-na')
    }
  })

  it('has no face for an unrecognised value', () => {
    expect(opinionDifficulty('IMPOSSIBLE')).toBeNull()
  })
})

describe('opinionShortLabel', () => {
  it('drops "Not demon-worthy", which the face already says', () => {
    expect(opinionShortLabel('NINE_STAR')).toBe('9★ Insane')
  })

  it('reads as the tier for a demon answer', () => {
    expect(opinionShortLabel('MEDIUM')).toBe('Medium')
  })

  it('falls back to the raw value', () => {
    expect(opinionShortLabel('IMPOSSIBLE')).toBe('IMPOSSIBLE')
  })
})
