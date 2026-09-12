import { describe, expect, it } from 'vitest'
import {
  communityTierChip,
  communityTierChips,
  type CommunityTierSource,
} from '@/lib/communityTiers'

// A level on none of the three lists; each case names only what it is about.
function level(
  overrides: Partial<CommunityTierSource> = {}
): CommunityTierSource {
  return {
    gddlTier: null,
    aredlRank: null,
    aredlStatus: null,
    sheetTier: null,
    ...overrides,
  }
}

describe('communityTierChips', () => {
  it('returns nothing for a level on none of the lists', () => {
    expect(communityTierChips(level())).toEqual([])
  })

  // The order is the one every surface shows them in.
  it('returns the lists a level is on, in list order', () => {
    const chips = communityTierChips(
      level({
        gddlTier: 34,
        aredlRank: 5,
        aredlStatus: 'MainList',
        sheetTier: 20,
      })
    )

    expect(chips.map((c) => c.key)).toEqual(['gddl', 'aredl', 'sheet'])
    expect(chips.map((c) => c.look.badge)).toEqual(['34', '#5', 'Nightmare'])
  })

  it('skips the lists a level is not on', () => {
    const chips = communityTierChips(level({ gddlTier: 12 }))

    expect(chips.map((c) => c.key)).toEqual(['gddl'])
  })

  // GDDL rates demons and the other two cover extremes, so "has a placement"
  // is already the right gate — and it keeps the AREDL chip on an insane demon
  // that AREDL demoted to Legacy, which a difficulty gate would hide.
  it('keeps an AREDL chip on a level with a status but no rank', () => {
    const chips = communityTierChips(level({ aredlStatus: 'Pending' }))

    expect(chips.map((c) => c.look.badge)).toEqual(['Pending'])
  })

  // Tier 0 ("Fuck") is a real placement — a truthiness check would drop it.
  it('keeps sheet tier 0', () => {
    const chips = communityTierChips(level({ sheetTier: 0 }))

    expect(chips[0]).toMatchObject({
      key: 'sheet',
      look: { badge: 'Fuck' },
      source: 'NLW',
      value: 0,
    })
  })
})

describe('communityTierChip', () => {
  it('is null for a list the level is not on', () => {
    expect(communityTierChip(level({ gddlTier: 20 }), 'aredl')).toBeNull()
  })

  // The label is the chip's whole accessible name — the chip itself is only a
  // favicon and a badge — so it has to say what the number is.
  it('says whether an AREDL figure is a rank or a status', () => {
    expect(
      communityTierChip(
        level({ aredlRank: 12, aredlStatus: 'MainList' }),
        'aredl'
      )
    ).toMatchObject({ label: 'AREDL rank' })

    expect(
      communityTierChip(
        level({ aredlRank: 1580, aredlStatus: 'Legacy' }),
        'aredl'
      )
    ).toMatchObject({ label: 'AREDL status', look: { badge: 'Legacy' } })
  })

  // GDDL exposes decimals but treats the whole number as canonical, and
  // `value` is what callers match on (the sheet's tier 0 explainer).
  it('carries the whole-number tier as its value', () => {
    expect(communityTierChip(level({ gddlTier: 23 }), 'gddl')).toMatchObject({
      value: 23,
      look: { badge: '23' },
    })
  })

  // Every list icon has to resolve, or the chip is an anonymous badge.
  it('gives each list its own icon', () => {
    const icons = (['gddl', 'aredl', 'sheet'] as const).map(
      (key) =>
        communityTierChip(
          level({ gddlTier: 10, aredlRank: 1, sheetTier: 5 }),
          key
        )?.icon
    )

    expect(new Set(icons).size).toBe(3)
    expect(icons.every((i) => typeof i === 'string' && i.length > 0)).toBe(true)
  })
})
