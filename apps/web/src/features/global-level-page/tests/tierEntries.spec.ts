import { describe, expect, it } from 'vitest'
import { makeGlobalLevel } from '@/utils/testUtils'
import { tierEntries } from '../tierEntries'

const level = (overrides: Record<string, unknown> = {}) =>
  makeGlobalLevel({
    inGameId: '86407629',
    gddlTier: null,
    aredlRank: null,
    sheetTier: null,
    ...overrides,
  })

describe('tierEntries', () => {
  it('returns nothing when the level is on no community list', () => {
    // The page uses this to decide whether the TIERS section exists at all.
    expect(tierEntries(level())).toEqual([])
  })

  it('lists every placement a level holds, in list order', () => {
    const entries = tierEntries(
      level({ gddlTier: 39, aredlRank: 5, sheetTier: 20 })
    )

    expect(entries.map((e) => e.key)).toEqual(['gddl', 'aredl', 'sheet'])
    expect(entries.map((e) => e.badge)).toEqual(['39', '#5', '20'])
  })

  it('skips the lists a level is absent from', () => {
    const entries = tierEntries(level({ gddlTier: 12 }))

    expect(entries).toHaveLength(1)
    expect(entries[0]?.key).toBe('gddl')
  })

  it('points GDDL and AREDL at their own pages for the level', () => {
    const entries = tierEntries(level({ gddlTier: 39, aredlRank: 5 }))

    expect(entries[0]?.href).toBe('https://gdladder.com/level/86407629')
    expect(entries[1]?.href).toBe('https://aredl.net/list/86407629')
  })

  // The sheets have no per-level anchor, so the row opens whichever of the two
  // documents holds the tier — which makes the NLW/LW split load-bearing for
  // more than the chip.
  it('points a listworthy tier at the LW sheet', () => {
    const href = tierEntries(level({ sheetTier: 20 }))[0]?.href

    expect(href).toContain('docs.google.com/spreadsheets')
    expect(href).toContain('15YvW2rRQKlkNpdFMTaRt9CWefDkng6BSh6xRDXSw9r8')
  })

  it('points a non-listworthy tier at the NLW sheet instead', () => {
    const href = tierEntries(level({ sheetTier: 13 }))[0]?.href

    expect(href).toContain('1YxUE2kkvhT2E6AjnkvTf-o8iu_shSLbuFkEFcZOvieA')
  })

  it('rounds a GDDL tier that was cached before ingestion rounded it', () => {
    const entries = tierEntries(level({ gddlTier: 23.98 } as never))

    expect(entries[0]?.badge).toBe('24')
  })

  // The whole reason sheetTier is guarded with isSheetTier rather than
  // truthiness: tier 0 ("Fuck") is a real placement.
  it('renders sheet tier 0 as a placement, not an absence', () => {
    const entries = tierEntries(level({ sheetTier: 0 }))

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      key: 'sheet',
      badge: '0',
      detail: 'Fuck',
      source: 'NLW',
    })
  })

  it('marks which spreadsheet a sheet tier came from, splitting at 14', () => {
    expect(tierEntries(level({ sheetTier: 13 }))[0]?.source).toBe('NLW')
    expect(tierEntries(level({ sheetTier: 14 }))[0]?.source).toBe('LW')
  })

  it('names the sheet tier alongside its number', () => {
    expect(tierEntries(level({ sheetTier: 20 }))[0]?.detail).toBe('Nightmare')
  })

  it('drops a sheet tier outside the range the sheets define', () => {
    expect(tierEntries(level({ sheetTier: 99 }))).toEqual([])
  })

  it('gives every entry a foreground that reads against its badge', () => {
    const entries = tierEntries(
      level({ gddlTier: 1, aredlRank: 5, sheetTier: 6 })
    )

    for (const entry of entries) {
      expect(entry.textColor).toMatch(/^#(0d0d0d|f5f5f5)$/)
    }
  })
})
