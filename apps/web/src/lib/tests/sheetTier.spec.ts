import { describe, expect, it } from 'vitest'
import {
  LISTWORTHY_MIN_TIER,
  MAX_SHEET_TIER,
  SHEET_TIER_COLORS,
  SHEET_TIER_NAMES,
  isSheetTier,
  readableTextColor,
  sheetTierColor,
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
  it('returns the documented colour for a pinned tier', () => {
    expect(sheetTierColor(1)).toBe('#6495ED')
    expect(sheetTierColor(6)).toBe('#FF0000')
  })

  it('returns null for a tier outside the range', () => {
    expect(sheetTierColor(null)).toBeNull()
    expect(sheetTierColor(22)).toBeNull()
  })
})

describe('readableTextColor', () => {
  it('picks dark text on light backgrounds and light text on dark ones', () => {
    expect(readableTextColor('#FFD700')).toBe('#0d0d0d')
    expect(readableTextColor('#9400D3')).toBe('#f5f5f5')
  })

  it('falls back to light text for an unparseable value', () => {
    expect(readableTextColor('nonsense')).toBe('#f5f5f5')
  })
})
