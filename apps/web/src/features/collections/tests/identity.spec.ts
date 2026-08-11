import { describe, expect, it } from 'vitest'
import { Heart, HeartCrack, List, Star } from 'lucide-react'
import { CollectionType } from '@infernolog/core'
import { collectionIdentity, isBuiltIn, withAlpha } from '../identity'

describe('collectionIdentity', () => {
  it.each([
    [CollectionType.WANT_TO_BEAT, Star],
    [CollectionType.FAVORITES, Heart],
    [CollectionType.LEAST_FAVORITES, HeartCrack],
  ])('gives %s its own fixed glyph', (type, icon) => {
    expect(collectionIdentity(type, 'any-id').icon).toBe(icon)
  })

  it('gives each built-in a distinct accent', () => {
    const colors = [
      CollectionType.WANT_TO_BEAT,
      CollectionType.FAVORITES,
      CollectionType.LEAST_FAVORITES,
    ].map((type) => collectionIdentity(type, 'any-id').color)

    expect(new Set(colors).size).toBe(colors.length)
  })

  it('ignores the id for built-ins, so the same type always looks the same', () => {
    expect(collectionIdentity(CollectionType.FAVORITES, 'a')).toEqual(
      collectionIdentity(CollectionType.FAVORITES, 'b')
    )
  })

  it('falls back to the generic list glyph for custom collections', () => {
    expect(collectionIdentity(CollectionType.CUSTOM, 'abc').icon).toBe(List)
  })

  // The identity is re-derived on every render across the card, hero, and FAB
  // — a collection that changed color between them would read as a bug.
  it('derives a stable custom accent from the id', () => {
    const first = collectionIdentity(CollectionType.CUSTOM, 'abc')
    const second = collectionIdentity(CollectionType.CUSTOM, 'abc')

    expect(first.color).toBe(second.color)
  })

  it('always lands on a real hex accent, whatever the id', () => {
    const ids = ['', 'a', 'z'.repeat(64), '0', 'e5f0-4a11-9c22', '🔥']

    for (const id of ids) {
      expect(collectionIdentity(CollectionType.CUSTOM, id).color).toMatch(
        /^#[0-9a-f]{6}$/
      )
    }
  })

  // hashString multiplies by 31 with `| 0`, so a long id overflows into a
  // negative number; Math.abs is what keeps the modulo from indexing off the
  // front of the palette and yielding `undefined`.
  it('handles ids long enough to overflow the hash', () => {
    const identity = collectionIdentity(CollectionType.CUSTOM, 'x'.repeat(500))

    expect(identity.color).toBeDefined()
    expect(identity.icon).toBe(List)
  })

  it('spreads custom collections across more than one accent', () => {
    const colors = new Set(
      Array.from(
        { length: 40 },
        (_, i) => collectionIdentity(CollectionType.CUSTOM, `id-${i}`).color
      )
    )

    expect(colors.size).toBeGreaterThan(1)
  })

  it('treats an unrecognized type as custom rather than throwing', () => {
    expect(collectionIdentity('SOMETHING_NEW', 'abc').icon).toBe(List)
  })
})

describe('withAlpha', () => {
  it.each([
    ['#000000', 0.5, 'rgba(0, 0, 0, 0.5)'],
    ['#ffffff', 1, 'rgba(255, 255, 255, 1)'],
    ['#e8390e', 0.12, 'rgba(232, 57, 14, 0.12)'],
  ])('converts %s at alpha %s', (hex, alpha, expected) => {
    expect(withAlpha(hex, alpha)).toBe(expected)
  })

  it('round-trips every built-in accent', () => {
    for (const type of [
      CollectionType.WANT_TO_BEAT,
      CollectionType.FAVORITES,
      CollectionType.LEAST_FAVORITES,
    ]) {
      expect(withAlpha(collectionIdentity(type, 'id').color, 0.2)).toMatch(
        /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.2\)$/
      )
    }
  })
})

describe('isBuiltIn', () => {
  it.each([
    CollectionType.WANT_TO_BEAT,
    CollectionType.FAVORITES,
    CollectionType.LEAST_FAVORITES,
  ])('reports %s as built-in', (type) => {
    expect(isBuiltIn(type)).toBe(true)
  })

  it('reports CUSTOM as not built-in', () => {
    expect(isBuiltIn(CollectionType.CUSTOM)).toBe(false)
  })

  // Built-ins are the closed set of everything that is not CUSTOM, so any
  // type added server-side is immutable here until it is handled explicitly.
  it('treats an unknown type as built-in', () => {
    expect(isBuiltIn('SOMETHING_NEW')).toBe(true)
  })
})
