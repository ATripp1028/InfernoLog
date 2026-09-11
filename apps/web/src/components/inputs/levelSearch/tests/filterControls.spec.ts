import { describe, expect, it } from 'vitest'
import {
  ANY_SHEET_TIER,
  SHEET_TIER_OPTIONS,
  TRISTATE,
  fromTri,
  sheetTierFromSelect,
  sheetTierSelectValue,
  toggle,
  triValue,
} from '../filterControls'
import { sortTriggerLabel } from '../SortMenu'
import { LEVEL_SORT_OPTIONS } from '@/lib/levelSearchParams'

describe('toggle', () => {
  it('adds a value that is not selected', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('removes a value that is', () => {
    expect(toggle(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('adds to an absent filter', () => {
    expect(toggle(undefined, 'a')).toEqual(['a'])
  })

  // An emptied array collapses back to undefined so the URL stays clean —
  // `?difficulty=` is not the same as the filter being absent, and only the
  // absent form round-trips as "no constraint".
  it('collapses to nothing when the last value is removed', () => {
    expect(toggle(['a'], 'a')).toBeUndefined()
  })

  it('leaves the input untouched', () => {
    const original = ['a']

    toggle(original, 'b')

    expect(original).toEqual(['a'])
  })

  it('round-trips back to the original selection', () => {
    expect(toggle(toggle(['a', 'b'], 'c'), 'c')).toEqual(['a', 'b'])
  })

  // A duplicate in a hand-edited URL should not survive a toggle.
  it('de-duplicates as it goes', () => {
    expect(toggle(['a', 'a'], 'b')).toEqual(['a', 'b'])
  })
})

describe('the tri-state control', () => {
  it('offers exactly the three segments', () => {
    expect(TRISTATE.map((t) => t.value)).toEqual(['any', 'yes', 'no'])
  })

  it('labels every segment', () => {
    expect(TRISTATE.every((t) => t.label.length > 0)).toBe(true)
  })

  // An absent filter is "any", which is what makes the control's default
  // position mean "no constraint" rather than "false".
  it.each([
    [undefined, 'any'],
    [true, 'yes'],
    [false, 'no'],
  ] as const)('shows %p on the %s segment', (value, segment) => {
    expect(triValue(value)).toBe(segment)
  })

  it.each([
    ['any', undefined],
    ['yes', true],
    ['no', false],
  ] as const)('turns the %s segment into %p', (segment, value) => {
    expect(fromTri(segment)).toBe(value)
  })

  // 'any' clears the filter rather than setting it false, which is the
  // distinction the whole control exists to express.
  it('clears the filter rather than setting it false', () => {
    expect(fromTri('any')).toBeUndefined()
    expect(fromTri('no')).toBe(false)
  })

  it.each([undefined, true, false] as const)(
    'round-trips %p through the control',
    (value) => {
      expect(fromTri(triValue(value))).toBe(value)
    }
  )

  it('round-trips every segment back to itself', () => {
    for (const { value } of TRISTATE) {
      expect(triValue(fromTri(value))).toBe(value)
    }
  })
})

describe('the sheet tier dropdown', () => {
  // Tier 0 is a real tier, so the ladder starts there.
  it('offers every tier on the ladder once, tier 0 included', () => {
    expect(SHEET_TIER_OPTIONS.map((o) => o.tier)).toEqual(
      Array.from({ length: 22 }, (_, i) => i)
    )
  })

  it('marks tiers 14 and up as listworthy', () => {
    expect(
      SHEET_TIER_OPTIONS.filter((o) => o.look.source === 'LW').map(
        (o) => o.tier
      )
    ).toEqual([14, 15, 16, 17, 18, 19, 20, 21])
  })

  // People pick the tiers by name; the number is the sheets' internal index.
  it('names each tier rather than numbering it', () => {
    expect(SHEET_TIER_OPTIONS[14]!.look.badge).toBe('Merciless')
  })

  it('explains tier 0, and only tier 0', () => {
    expect(SHEET_TIER_OPTIONS.filter((o) => o.note).map((o) => o.tier)).toEqual(
      [0]
    )
  })

  it('shows an absent filter as the "any" entry', () => {
    expect(sheetTierSelectValue(undefined)).toBe(ANY_SHEET_TIER)
  })

  it('round-trips every tier through the dropdown', () => {
    for (const { tier, value } of SHEET_TIER_OPTIONS) {
      expect(sheetTierSelectValue(tier)).toBe(value)
      expect(sheetTierFromSelect(value)).toBe(tier)
    }
  })

  it.each([ANY_SHEET_TIER, '22', '-1', 'abc'])(
    'clears the filter for %p',
    (value) => {
      expect(sheetTierFromSelect(value)).toBeUndefined()
    }
  )
})

describe('sortTriggerLabel', () => {
  it('labels every declared sort', () => {
    for (const option of LEVEL_SORT_OPTIONS) {
      expect(sortTriggerLabel(option.value)).toBe(option.label)
    }
  })

  // Better a generic word on the trigger than a blank button, if a sort ever
  // arrives from a URL that the option table does not know about.
  it('falls back to a generic label for an unknown sort', () => {
    expect(sortTriggerLabel('nonsense' as never)).toBe('Sort')
  })
})
