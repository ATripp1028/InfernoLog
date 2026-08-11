import { describe, expect, it } from 'vitest'
import {
  collectedCoinSrc,
  difficultyFaceSrc,
  isOfficialLevel,
  levelGlow,
  levelGlowSrc,
  levelThumbnailPlaceholder,
  levelThumbnailUrl,
  officialCoinSrc,
  showsRatedStar,
  starCountToDifficulty,
  uncollectedCoinSrc,
  userCoinSilverSrc,
  userCoinSrc,
} from '../gdAssets'

/** The asset's basename, which is what these functions really decide. */
const face = (difficulty: string | null) =>
  difficultyFaceSrc(difficulty).split('/').pop()

describe('difficultyFaceSrc', () => {
  it.each([
    ['Auto', 'difficulty-auto.png'],
    ['Easy', 'difficulty-easy.png'],
    ['Normal', 'difficulty-normal.png'],
    ['Hard', 'difficulty-hard.png'],
    ['Harder', 'difficulty-harder.png'],
    ['Insane', 'difficulty-insane.png'],
  ])('maps %s to %s', (difficulty, expected) => {
    expect(face(difficulty)).toBe(expected)
  })

  it.each([
    ['Easy Demon', 'demon-easy.png'],
    ['Medium Demon', 'demon-medium.png'],
    ['Hard Demon', 'demon-hard.png'],
    ['Insane Demon', 'demon-insane.png'],
    ['Extreme Demon', 'demon-extreme.png'],
  ])('maps %s to %s', (difficulty, expected) => {
    expect(face(difficulty)).toBe(expected)
  })

  // "Harder" contains "hard", so order of matching decides this one.
  it('does not mistake Harder for Hard', () => {
    expect(face('Harder')).toBe('difficulty-harder.png')
  })

  // A demon label wins over the standard face even though "Hard Demon"
  // contains "hard" — demon-ness is checked first.
  it('reads a demon label as a demon face, not a standard one', () => {
    expect(face('Hard Demon')).toBe('demon-hard.png')
    expect(face('Insane Demon')).toBe('demon-insane.png')
  })

  // Older/looser sources send a bare "Demon" with no tier; RobTop's own
  // default for an untiered demon is the hard face.
  it('falls back to the hard demon face for a bare Demon', () => {
    expect(face('Demon')).toBe('demon-hard.png')
  })

  it('is case-insensitive', () => {
    expect(face('EXTREME DEMON')).toBe('demon-extreme.png')
    expect(face('extreme demon')).toBe('demon-extreme.png')
  })

  // Unrated levels have no difficulty at all — the NA face, not a crash.
  it.each([
    ['a missing difficulty', null],
    ['an empty difficulty', ''],
    ['an unrecognised difficulty', 'Impossible'],
  ])('falls back to the NA face for %s', (_label, difficulty) => {
    expect(face(difficulty)).toBe('difficulty-na.png')
  })

  it('points into the GD asset folder', () => {
    expect(difficultyFaceSrc('Insane')).toBe('/assets/gd/difficulty-insane.png')
  })
})

// A rated standard-difficulty level and an unrated one share a face, so only
// those need the star to tell them apart.
describe('showsRatedStar', () => {
  it.each(['Easy', 'Normal', 'Hard', 'Harder', 'Insane'])(
    'stars a rated %s level',
    (difficulty) => {
      expect(showsRatedStar(difficulty, true)).toBe(true)
    }
  )

  it.each(['Easy', 'Normal', 'Hard', 'Harder', 'Insane'])(
    'does not star an unrated %s level',
    (difficulty) => {
      expect(showsRatedStar(difficulty, false)).toBe(false)
    }
  )

  // Demons and autos are always rated, so a star there would be noise on
  // every single one.
  it.each(['Easy Demon', 'Extreme Demon', 'Demon', 'Auto'])(
    'does not star %s, which is rated by definition',
    (difficulty) => {
      expect(showsRatedStar(difficulty, true)).toBe(false)
    }
  )

  // NA only ever applies to an unrated level, so a rated NA is a contradiction.
  it('does not star the NA face', () => {
    expect(showsRatedStar(null, true)).toBe(false)
  })

  it.each([null, undefined])('treats %p as unrated', (rated) => {
    expect(showsRatedStar('Insane', rated)).toBe(false)
  })
})

describe('starCountToDifficulty', () => {
  it.each([
    [1, 'Auto'],
    [2, 'Easy'],
    [3, 'Normal'],
    [4, 'Hard'],
    [5, 'Hard'],
    [6, 'Harder'],
    [7, 'Harder'],
    [8, 'Insane'],
    [9, 'Insane'],
  ])('maps %s stars to %s', (stars, expected) => {
    expect(starCountToDifficulty(stars)).toBe(expected)
  })

  // The picker only offers 1-9, but a hand-edited value must not fall off
  // the end of the table.
  it('clamps below the picker’s range', () => {
    expect(starCountToDifficulty(0)).toBe('Auto')
  })

  it('clamps above the picker’s range', () => {
    expect(starCountToDifficulty(10)).toBe('Insane')
  })
})

describe('levelGlow', () => {
  it.each([
    [3, 'mythic'],
    [2, 'legendary'],
    [1, 'epic'],
  ] as const)('reads epicValue %s as %s', (epicValue, glow) => {
    expect(levelGlow(epicValue, false)).toBe(glow)
  })

  it('reads a merely featured level as the feature glow', () => {
    expect(levelGlow(0, true)).toBe('featured')
  })

  // Merely rated earns no glow at all.
  it.each([
    ['unrated', null, false],
    ['rated only', 0, false],
    ['unknown', undefined, undefined],
  ] as const)('gives %s levels no glow', (_label, epicValue, featured) => {
    expect(levelGlow(epicValue, featured)).toBeNull()
  })

  // An epic level is also flagged featured; the higher showcase wins.
  it.each([3, 2, 1] as const)(
    'lets epicValue %s outrank a plain feature',
    (epicValue) => {
      expect(levelGlow(epicValue, true)).not.toBe('featured')
    }
  )

  it('ignores an epicValue outside the known ranks', () => {
    expect(levelGlow(4, false)).toBeNull()
  })
})

describe('levelGlowSrc', () => {
  it.each([
    [3, '/assets/gd/bg-mythic.png'],
    [2, '/assets/gd/bg-legendary.png'],
    [1, '/assets/gd/bg-epic.png'],
  ] as const)('sprites epicValue %s as %s', (epicValue, src) => {
    expect(levelGlowSrc(epicValue, false)).toBe(src)
  })

  // The asset is bg-feature.png, not bg-featured.png — the glow name and the
  // filename disagree here alone.
  it('sprites the feature glow as bg-feature', () => {
    expect(levelGlowSrc(0, true)).toBe('/assets/gd/bg-feature.png')
  })

  it('has no sprite for a level with no glow', () => {
    expect(levelGlowSrc(0, false)).toBeNull()
  })
})

describe('isOfficialLevel', () => {
  it('recognises a RobTop level', () => {
    expect(isOfficialLevel({ creator: 'RobTop' })).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isOfficialLevel({ creator: 'robtop' })).toBe(true)
    expect(isOfficialLevel({ creator: 'ROBTOP' })).toBe(true)
  })

  it('does not match a creator merely containing the name', () => {
    expect(isOfficialLevel({ creator: 'NotRobTop' })).toBe(false)
  })

  it.each([
    ['another creator', { creator: 'Riot' }],
    ['a missing creator', { creator: null }],
    ['no creator field', {}],
  ])('does not match %s', (_label, level) => {
    expect(isOfficialLevel(level)).toBe(false)
  })
})

describe('the coin sprites', () => {
  // Official levels' coins are gold secret coins; user levels' are silver.
  it('gives an official level the gold secret coin', () => {
    expect(collectedCoinSrc({ creator: 'RobTop' })).toBe(officialCoinSrc)
  })

  it('gives an online level the silver user coin', () => {
    expect(collectedCoinSrc({ creator: 'Riot' })).toBe(userCoinSilverSrc)
  })

  // The list's reading, where unverified and uncollected share a sprite.
  it('shows a verified coin as silver', () => {
    expect(userCoinSrc(true)).toBe('/assets/gd/coin-user.png')
  })

  it.each([false, null, undefined])(
    'shows a %p coin as the greyed sprite',
    (verified) => {
      expect(userCoinSrc(verified)).toBe(uncollectedCoinSrc)
    }
  )

  it('keeps the silver and greyed sprites distinct', () => {
    expect(userCoinSilverSrc).not.toBe(uncollectedCoinSrc)
    expect(officialCoinSrc).not.toBe(userCoinSilverSrc)
  })
})

describe('the level thumbnail', () => {
  it('points at the community thumbnail host', () => {
    expect(levelThumbnailUrl('128')).toBe(
      'https://levelthumbs.prevter.me/thumbnail/128'
    )
  })

  // Local, so it still renders when the community host is unreachable —
  // which is exactly when it is needed.
  it('keeps the fallback local', () => {
    expect(levelThumbnailPlaceholder.startsWith('/')).toBe(true)
  })
})
