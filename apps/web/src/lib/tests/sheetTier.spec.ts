import { describe, expect, it } from 'vitest'
import {
  LISTWORTHY_MIN_TIER,
  MAX_SHEET_TIER,
  SHEET_TIER_COLORS,
  SHEET_TIER_NAMES,
  isSheetTier,
  readableTextColor,
  sheetTierColor,
  sheetTierFromName,
  sheetTierName,
  sheetTierSource,
} from '../sheetTier'

describe('sheet tier tables', () => {
  it('names and colours cover the same 0-21 range', () => {
    expect(SHEET_TIER_NAMES).toHaveLength(22)
    expect(SHEET_TIER_COLORS).toHaveLength(SHEET_TIER_NAMES.length)
    expect(MAX_SHEET_TIER).toBe(21)
  })
})

describe('isSheetTier', () => {
  // The whole point of the helper: tier 0 is a real placement, so no caller
  // should ever be tempted into a truthiness check.
  it('accepts tier 0', () => {
    expect(isSheetTier(0)).toBe(true)
  })

  it('rejects null, undefined, out-of-range, and non-integers', () => {
    expect(isSheetTier(null)).toBe(false)
    expect(isSheetTier(undefined)).toBe(false)
    expect(isSheetTier(-1)).toBe(false)
    expect(isSheetTier(22)).toBe(false)
    expect(isSheetTier(3.5)).toBe(false)
  })
})

describe('sheetTierName', () => {
  it('names the ends and the sheet boundary', () => {
    expect(sheetTierName(0)).toBe('Fuck')
    expect(sheetTierName(13)).toBe('Excruciating')
    expect(sheetTierName(14)).toBe('Merciless')
    expect(sheetTierName(21)).toBe('Unfathomable')
  })

  it('returns null rather than clamping an unknown tier', () => {
    expect(sheetTierName(22)).toBeNull()
    expect(sheetTierName(null)).toBeNull()
  })
})

describe('sheetTierSource', () => {
  it('splits the two sheets at tier 14', () => {
    expect(LISTWORTHY_MIN_TIER).toBe(14)
    expect(sheetTierSource(0)).toBe('NLW')
    expect(sheetTierSource(13)).toBe('NLW')
    expect(sheetTierSource(14)).toBe('LW')
    expect(sheetTierSource(21)).toBe('LW')
  })

  it('returns null for a tier outside the range', () => {
    expect(sheetTierSource(99)).toBeNull()
    expect(sheetTierSource(null)).toBeNull()
  })
})

describe('sheetTierColor', () => {
  it('returns the sheet’s own color for a tier', () => {
    expect(sheetTierColor(1)).toBe('#4a86e8')
    expect(sheetTierColor(6)).toBe('#ff0000')
  })

  // Tier 0 is black, which is exactly the value a truthiness check on the
  // colour would survive but a truthiness check on the tier would not.
  it('paints tier 0 rather than leaving it unpainted', () => {
    expect(sheetTierColor(0)).toBe('#000000')
  })

  it('covers every tier — no gaps left in the palette', () => {
    for (let tier = 0; tier <= MAX_SHEET_TIER; tier++) {
      expect(sheetTierColor(tier)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('returns null for a tier outside the range', () => {
    expect(sheetTierColor(null)).toBeNull()
    expect(sheetTierColor(22)).toBeNull()
  })
})

describe('readableTextColor', () => {
  it('picks dark text on light backgrounds and light text on dark ones', () => {
    expect(readableTextColor('#ffff00')).toBe('#0d0d0d')
    expect(readableTextColor('#000000')).toBe('#f5f5f5')
  })

  it('falls back to light text for an unparseable value', () => {
    expect(readableTextColor('nonsense')).toBe('#f5f5f5')
  })
})

// AREDL reports the spreadsheet tier by NAME, so this is the inverse lookup the
// API ingests through — the reason the ladder lives in packages/core at all.
describe('sheetTierFromName', () => {
  it('round-trips every tier through its name', () => {
    for (let tier = 0; tier <= MAX_SHEET_TIER; tier++) {
      expect(sheetTierFromName(sheetTierName(tier))).toBe(tier)
    }
  })

  it('resolves the bottom tier, which is the one only AREDL reports', () => {
    expect(sheetTierFromName('Fuck')).toBe(0)
  })

  it('matches case-insensitively and ignores surrounding space', () => {
    expect(sheetTierFromName('  relentless ')).toBe(9)
  })

  // A renamed tier upstream must degrade to "no placement", never throw — the
  // whole level check would otherwise fail over a copy change on a spreadsheet.
  it.each([
    ['an unknown name', 'Renamed Tier'],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['null', null],
    ['undefined', undefined],
  ])('returns null for %s', (_label, value) => {
    expect(sheetTierFromName(value)).toBeNull()
  })
})
