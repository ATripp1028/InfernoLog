import { describe, expect, it } from 'vitest'
import { makeGlobalLevel } from '@/utils/testUtils'
import { formatSongSize, isExtremeDemon } from '../format'

describe('formatSongSize', () => {
  it.each([
    [9.56, '9.56 MB'],
    [10, '10.00 MB'],
    [0.5, '0.50 MB'],
  ])('renders %s MB as %s', (mb, expected) => {
    expect(formatSongSize(mb)).toBe(expected)
  })

  it('always shows two decimals, rounding the raw float', () => {
    expect(formatSongSize(9.567)).toBe('9.57 MB')
    expect(formatSongSize(9.564)).toBe('9.56 MB')
  })

  // A zero-byte song is still a known size — distinct from an unknown one,
  // which the caller renders as an absent row rather than "0.00 MB".
  it('renders a zero size rather than treating it as absent', () => {
    expect(formatSongSize(0)).toBe('0.00 MB')
  })

  it('returns null for an unknown size', () => {
    expect(formatSongSize(null)).toBeNull()
  })
})

describe('isExtremeDemon', () => {
  const level = (isDemon: boolean, inGameDifficulty: string | null) =>
    makeGlobalLevel({ isDemon, inGameDifficulty })

  // AREDL only ranks Extreme Demons, so this gates whether its link renders.
  it.each(['EXTREME_DEMON', 'Extreme Demon', 'extreme demon'])(
    'accepts the demon difficulty %s whatever its casing',
    (difficulty) => {
      expect(isExtremeDemon(level(true, difficulty))).toBe(true)
    }
  )

  it.each(['INSANE_DEMON', 'HARD_DEMON', 'MEDIUM_DEMON', 'EASY_DEMON'])(
    'rejects the lesser demon difficulty %s',
    (difficulty) => {
      expect(isExtremeDemon(level(true, difficulty))).toBe(false)
    }
  )

  // Both halves are required: a non-demon can carry an "extreme" difficulty
  // string, and a demon can have no difficulty recorded at all.
  it('rejects a non-demon even when its difficulty says extreme', () => {
    expect(isExtremeDemon(level(false, 'EXTREME_DEMON'))).toBe(false)
  })

  it('rejects a demon with no recorded difficulty', () => {
    expect(isExtremeDemon(level(true, null))).toBe(false)
  })
})
