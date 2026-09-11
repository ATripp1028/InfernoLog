import { describe, expect, it } from 'vitest'
import {
  aredlLook,
  gddlTierLook,
  gddlTierTextColor,
  sheetTierLook,
} from '../tierBadges'

describe('gddlTierLook', () => {
  it('shows the whole tier, rounding a legacy decimal', () => {
    expect(gddlTierLook(23.98).badge).toBe('24')
  })

  // The low tiers are painted near-white; light text on them was unreadable.
  it.each([
    [1, '#0d0d0d'],
    [15, '#0d0d0d'],
    [16, '#f5f5f5'],
    [40, '#f5f5f5'],
  ])('writes tier %s in %s', (tier, expected) => {
    expect(gddlTierLook(tier).textColor).toBe(expected)
    expect(gddlTierTextColor(tier)).toBe(expected)
  })

  it('paints every tier', () => {
    expect(gddlTierLook(20).color).not.toBeNull()
  })
})

describe('aredlLook', () => {
  it('shows a main-list placement as a painted rank', () => {
    const look = aredlLook(12, 'MainList')!

    expect(look.badge).toBe('#12')
    expect(look.color).not.toBeNull()
    expect(look.ranked).toBe(true)
  })

  // GSV only reports main-list placements, and sends no status with them.
  it('treats a rank with no status as a main-list placement', () => {
    expect(aredlLook(12, null)!.ranked).toBe(true)
    expect(aredlLook(12, undefined)!.badge).toBe('#12')
  })

  // A Legacy position is a list index, not a rank — "#1580" would lie.
  it('shows a Legacy entry as its status, unpainted', () => {
    const look = aredlLook(1580, 'Legacy')!

    expect(look.badge).toBe('Legacy')
    expect(look.color).toBeNull()
    expect(look.ranked).toBe(false)
  })

  it('is absent for a level not on AREDL', () => {
    expect(aredlLook(null, null)).toBeNull()
  })
})

describe('sheetTierLook', () => {
  // Tier 0 is a real placement, so a truthiness check would lose it.
  it('names tier 0 like any other', () => {
    expect(sheetTierLook(0)).toMatchObject({ badge: 'Fuck', source: 'NLW' })
  })

  it.each([
    [13, 'NLW'],
    [14, 'LW'],
    [21, 'LW'],
  ] as const)('files tier %s under %s', (tier, source) => {
    expect(sheetTierLook(tier)!.source).toBe(source)
  })

  it('shows the name rather than the number', () => {
    expect(sheetTierLook(14)!.badge).toBe('Merciless')
  })

  it.each([null, undefined, -1, 22, 1.5])('is absent for %p', (tier) => {
    expect(sheetTierLook(tier)).toBeNull()
  })
})
