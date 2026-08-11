import { describe, expect, it } from 'vitest'
import { makeGlobalLevel } from '@/utils/testUtils'
import {
  coinDisplay,
  knownObjectCount,
  likeDisplay,
  provenanceParts,
  songSource,
  statFlags,
} from '../display'

describe('provenanceParts', () => {
  it.each([
    ['robtop_autofill', 'Source: GD servers'],
    ['manual', 'Source: Manual entry'],
    ['official', 'Source: Official'],
  ])('labels the %s source', (dataSource, expected) => {
    const parts = provenanceParts(makeGlobalLevel({ dataSource }))

    expect(parts[0]).toBe(expected)
  })

  // Better a raw slug the reader can look up than a blank segment, if the
  // server starts sending a source the frontend does not know about.
  it('falls through to the raw value for an unrecognized source', () => {
    const parts = provenanceParts(makeGlobalLevel({ dataSource: 'gddl_sync' }))

    expect(parts[0]).toBe('Source: gddl_sync')
  })

  it.each([
    [true, 'Verified'],
    [false, 'Unverified'],
  ])('reports verified=%s as %s', (verified, expected) => {
    const parts = provenanceParts(makeGlobalLevel({ verified }))

    expect(parts[1]).toBe(expected)
  })

  it('includes the last-checked date when there is one', () => {
    const parts = provenanceParts(
      makeGlobalLevel({ lastCheckedAt: '2026-03-14T10:00:00.000Z' })
    )

    // The date is locale-formatted (toLocaleDateString follows the reader's
    // locale by design), so assert the segment and its content rather than
    // pinning one locale's rendering — that would be testing Intl, not us.
    expect(parts).toHaveLength(3)
    expect(parts[2]).toMatch(/^Checked .*2026/)
  })

  // The suite pins TZ=UTC (vitest.config.ts) precisely so this is stable: the
  // same instant is Jan 1 2026 in UTC but Dec 31 2025 anywhere in the
  // Americas, which would otherwise make the year depend on the runner.
  it('reads the date in UTC rather than the runner local zone', () => {
    const parts = provenanceParts(
      makeGlobalLevel({ lastCheckedAt: '2026-01-01T02:00:00.000Z' })
    )

    expect(parts[2]).toMatch(/2026/)
    expect(parts[2]).not.toMatch(/2025/)
  })

  it('renders a different date for a different instant', () => {
    const at = (lastCheckedAt: string) =>
      provenanceParts(makeGlobalLevel({ lastCheckedAt }))[2]

    expect(at('2026-03-14T10:00:00.000Z')).not.toBe(
      at('2026-03-15T10:00:00.000Z')
    )
  })

  it('omits the date entirely when the level was never checked', () => {
    const parts = provenanceParts(makeGlobalLevel({ lastCheckedAt: null }))

    expect(parts).toHaveLength(2)
    expect(parts.some((p) => p.startsWith('Checked'))).toBe(false)
  })

  // Guards the NaN check — without it this renders "Checked Invalid Date".
  it('omits the date when it cannot be parsed', () => {
    const parts = provenanceParts(
      makeGlobalLevel({ lastCheckedAt: 'not-a-date' })
    )

    expect(parts).toHaveLength(2)
    expect(parts.join(' · ')).not.toContain('Invalid Date')
  })
})

describe('likeDisplay', () => {
  it('shows a positive score under the like icon', () => {
    expect(likeDisplay(makeGlobalLevel({ likes: 4200 }))).toEqual({
      negative: false,
      value: 4200,
    })
  })

  // GD stores dislikes as a negative like count; showing "-42" under a like
  // icon would read as a bug rather than as 42 dislikes.
  it('shows a negative score as a magnitude under the dislike icon', () => {
    expect(likeDisplay(makeGlobalLevel({ likes: -42 }))).toEqual({
      negative: true,
      value: 42,
    })
  })

  it.each([
    ['zero', 0],
    ['an unknown count', null],
  ])('treats %s as a non-negative zero', (_label, likes) => {
    expect(likeDisplay(makeGlobalLevel({ likes }))).toEqual({
      negative: false,
      value: 0,
    })
  })
})

describe('coinDisplay', () => {
  it('renders one sprite per coin', () => {
    expect(coinDisplay(makeGlobalLevel({ coins: 3 }))?.count).toBe(3)
  })

  it.each([
    ['a level with no coins', 0],
    ['a level whose coin count is unknown', null],
    ['a nonsensical negative count', -1],
  ])('shows nothing for %s', (_label, coins) => {
    expect(coinDisplay(makeGlobalLevel({ coins }))).toBeNull()
  })

  it('gives an official level the gold secret coin', () => {
    const coins = coinDisplay(
      makeGlobalLevel({ coins: 3, creator: 'RobTop', coinsVerified: false })
    )

    expect(coins).toMatchObject({
      official: true,
      bronze: false,
      label: 'Secret coin',
    })
  })

  it('matches the official creator whatever its casing', () => {
    expect(
      coinDisplay(makeGlobalLevel({ coins: 1, creator: 'robtop' }))?.official
    ).toBe(true)
  })

  it('gives a verified custom level the silver user coin', () => {
    const coins = coinDisplay(
      makeGlobalLevel({ coins: 3, creator: 'Riot', coinsVerified: true })
    )

    expect(coins).toMatchObject({
      official: false,
      bronze: false,
      label: 'Verified (silver) user coin',
    })
  })

  it.each([
    ['unverified', false],
    ['not yet known to be verified', null],
  ])('tints a %s custom level bronze', (_label, coinsVerified) => {
    const coins = coinDisplay(
      makeGlobalLevel({ coins: 3, creator: 'Riot', coinsVerified })
    )

    expect(coins).toMatchObject({
      official: false,
      bronze: true,
      label: 'Unverified (bronze) user coin',
    })
  })

  // An official level's coins are secret coins whether or not the verified
  // flag came back — bronze is a user-coin concept.
  it('never tints an official level bronze', () => {
    const coins = coinDisplay(
      makeGlobalLevel({ coins: 3, creator: 'RobTop', coinsVerified: null })
    )

    expect(coins?.bronze).toBe(false)
  })
})

describe('knownObjectCount', () => {
  it('reports a real count', () => {
    expect(knownObjectCount(makeGlobalLevel({ objectCount: 24000 }))).toBe(
      24000
    )
  })

  // The browse endpoint only reports object count for newer levels; older ones
  // come back as 0, and a real level never has 0 objects. Rendering "0" would
  // be confidently wrong, so 0 has to be indistinguishable from unknown here.
  it.each([
    ['a zero from an older level', 0],
    ['an absent count', null],
  ])('treats %s as unknown', (_label, objectCount) => {
    expect(knownObjectCount(makeGlobalLevel({ objectCount }))).toBeNull()
  })
})

describe('statFlags', () => {
  it('lists both flags in display order', () => {
    const flags = statFlags(
      makeGlobalLevel({ twoPlayer: true, lowDetailMode: true })
    )

    expect(flags).toEqual(['2-Player', 'Low Detail Mode'])
  })

  it.each([
    [
      'two-player only',
      { twoPlayer: true, lowDetailMode: false },
      ['2-Player'],
    ],
    [
      'low-detail only',
      { twoPlayer: false, lowDetailMode: true },
      ['Low Detail Mode'],
    ],
  ])('lists %s', (_label, level, expected) => {
    expect(statFlags(makeGlobalLevel(level))).toEqual(expected)
  })

  // The chips row is omitted entirely rather than rendering "2-Player: No",
  // so an empty list is the signal the component keys on.
  it.each([
    ['both are false', { twoPlayer: false, lowDetailMode: false }],
    ['neither is known', { twoPlayer: null, lowDetailMode: null }],
  ])('lists nothing when %s', (_label, level) => {
    expect(statFlags(makeGlobalLevel(level))).toEqual([])
  })
})

describe('songSource', () => {
  it('names an official in-game track', () => {
    expect(songSource(makeGlobalLevel({ officialSongId: 1 }))).toBe(
      'In-game track'
    )
  })

  // Song id 0 is Stereo Madness, a real official track — `!= null` rather than
  // a truthiness check is what keeps it from being mislabelled Newgrounds.
  it('names official song id 0 as an in-game track', () => {
    expect(songSource(makeGlobalLevel({ officialSongId: 0 }))).toBe(
      'In-game track'
    )
  })

  it('names a custom song as Newgrounds', () => {
    expect(songSource(makeGlobalLevel({ officialSongId: null }))).toBe(
      'Newgrounds'
    )
  })
})
