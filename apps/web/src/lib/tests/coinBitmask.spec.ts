import { describe, expect, it } from 'vitest'
import { coinIsCollected, coinMaskFromFlags, toggleCoin } from '../coinBitmask'

describe('coinIsCollected', () => {
  // Bit 0 is coin 1 — the off-by-one this module exists to stop being
  // re-derived per surface.
  it.each([
    [0b001, 0, true],
    [0b001, 1, false],
    [0b010, 1, true],
    [0b100, 2, true],
  ])('reads mask %s at index %s as %s', (mask, index, expected) => {
    expect(coinIsCollected(mask, index)).toBe(expected)
  })

  it('reads every coin of a full mask', () => {
    expect([0, 1, 2].map((i) => coinIsCollected(0b111, i))).toEqual([
      true,
      true,
      true,
    ])
  })

  it('reads none of an empty mask', () => {
    expect([0, 1, 2].map((i) => coinIsCollected(0, i))).toEqual([
      false,
      false,
      false,
    ])
  })

  it('reads a partial mask', () => {
    expect([0, 1, 2].map((i) => coinIsCollected(0b101, i))).toEqual([
      true,
      false,
      true,
    ])
  })

  // A null mask means the row never said. Callers that need to tell that from
  // "collected none" check for null themselves.
  it.each([null, undefined])('reads %p as nothing collected', (mask) => {
    expect(coinIsCollected(mask, 0)).toBe(false)
  })

  it('reads an index beyond the mask as uncollected', () => {
    expect(coinIsCollected(0b111, 5)).toBe(false)
  })
})

describe('toggleCoin', () => {
  it('collects an uncollected coin', () => {
    expect(toggleCoin(0, 0)).toBe(0b001)
  })

  it('uncollects a collected one', () => {
    expect(toggleCoin(0b001, 0)).toBe(0)
  })

  it('leaves the other coins alone', () => {
    expect(toggleCoin(0b101, 1)).toBe(0b111)
    expect(toggleCoin(0b111, 1)).toBe(0b101)
  })

  it('round-trips back to where it started', () => {
    for (const i of [0, 1, 2]) {
      expect(toggleCoin(toggleCoin(0b010, i), i)).toBe(0b010)
    }
  })

  // Toggling every coin in turn from empty collects them all, which is the
  // sequence a user clicking three coins actually produces.
  it('collects them all one at a time', () => {
    let mask = 0
    for (const i of [0, 1, 2]) mask = toggleCoin(mask, i)

    expect(mask).toBe(0b111)
  })

  it('agrees with what coinIsCollected then reads back', () => {
    const mask = toggleCoin(0, 2)

    expect(coinIsCollected(mask, 2)).toBe(true)
    expect(coinIsCollected(mask, 0)).toBe(false)
  })
})

describe('coinMaskFromFlags', () => {
  it('folds flags into a mask, coin 1 first', () => {
    expect(coinMaskFromFlags([true, false, false])).toBe(0b001)
    expect(coinMaskFromFlags([false, true, false])).toBe(0b010)
    expect(coinMaskFromFlags([false, false, true])).toBe(0b100)
  })

  it('folds every flag at once', () => {
    expect(coinMaskFromFlags([true, true, true])).toBe(0b111)
  })

  // A row that says false everywhere is asserting none were collected — a
  // real, recorded zero.
  it('reads all-false as a mask of zero, not as unsaid', () => {
    expect(coinMaskFromFlags([false, false, false])).toBe(0)
  })

  // A row with no coin columns at all is saying nothing, which must not
  // overwrite whatever is already recorded.
  it.each([
    ['all null', [null, null, null]],
    ['all undefined', [undefined, undefined, undefined]],
    ['no flags at all', []],
  ])('reads %s as unsaid', (_label, flags) => {
    expect(coinMaskFromFlags(flags)).toBeNull()
  })

  // A partially filled row still says something, and the unsaid columns read
  // as uncollected rather than voiding the whole row.
  it('treats a missing flag among stated ones as uncollected', () => {
    expect(coinMaskFromFlags([null, true, null])).toBe(0b010)
  })

  it('round-trips a mask through its flags', () => {
    for (const mask of [0, 0b001, 0b010, 0b101, 0b111]) {
      const flags = [0, 1, 2].map((i) => coinIsCollected(mask, i))

      expect(coinMaskFromFlags(flags)).toBe(mask)
    }
  })

  it('handles a level with fewer than three coins', () => {
    expect(coinMaskFromFlags([true])).toBe(0b001)
    expect(coinMaskFromFlags([false, true])).toBe(0b010)
  })
})
