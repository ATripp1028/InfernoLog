import { describe, expect, it } from 'vitest'
import { officialCoinSrc, userCoinSrc } from '@/lib/gdAssets'
import { coinDisplay } from '../coins'
import { LIST_SORT_OPTIONS, defaultDir, getSortLabel } from '../sortMeta'
import { gddlTierColor, gddlTrackGradient } from '@/lib/tierColor'
import { level } from './fixtures'

describe('coinDisplay', () => {
  it('reports the coin count', () => {
    expect(coinDisplay(level({ coins: 3 }))?.count).toBe(3)
  })

  it.each([
    ['a level with no coins', 0],
    ['a level whose count is unknown', null],
  ])('shows nothing for %s', (_label, coins) => {
    expect(coinDisplay(level({ coins }))).toBeNull()
  })

  // Official levels carry gold secret coins; everything else is a user coin.
  it('gives an official level the gold sprite', () => {
    expect(coinDisplay(level({ coins: 3, creator: 'RobTop' }))?.src).toBe(
      officialCoinSrc
    )
  })

  it('matches the official creator whatever its casing', () => {
    expect(coinDisplay(level({ coins: 3, creator: 'robtop' }))?.src).toBe(
      officialCoinSrc
    )
  })

  // The user-coin sprite doubles as the "are these silver-verified?" signal,
  // so verified and unverified are different images rather than a tint.
  it.each([
    ['verified', true],
    ['unverified', false],
    ['unknown', null],
  ])('gives a %s user level its matching sprite', (_label, verified) => {
    expect(
      coinDisplay(level({ coins: 3, creator: 'Riot', coinsVerified: verified }))
        ?.src
    ).toBe(userCoinSrc(verified))
  })

  it('distinguishes verified from unverified user coins', () => {
    const yes = coinDisplay(
      level({ coins: 3, creator: 'Riot', coinsVerified: true })
    )
    const no = coinDisplay(
      level({ coins: 3, creator: 'Riot', coinsVerified: false })
    )

    expect(yes!.src).not.toBe(no!.src)
  })
})

describe('sort metadata', () => {
  it('labels every sortable column', () => {
    for (const option of LIST_SORT_OPTIONS) {
      expect(getSortLabel(option.key, [])).toBe(option.label)
    }
  })

  it('declares each sort key exactly once', () => {
    const keys = LIST_SORT_OPTIONS.map((o) => o.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  // Per-category sorts are discovered at runtime from the user's own rating
  // categories, so their labels arrive alongside the lookup.
  it('labels a dynamic category sort from the options passed in', () => {
    expect(
      getSortLabel('cat:gameplay', [{ key: 'cat:gameplay', label: 'Gameplay' }])
    ).toBe('Gameplay')
  })

  it('lets a dynamic option win over the static table', () => {
    expect(getSortLabel('date', [{ key: 'date', label: 'Logged' }])).toBe(
      'Logged'
    )
  })

  // Better a raw key on screen than a blank chip.
  it('falls back to the raw key for an unknown sort', () => {
    expect(getSortLabel('cat:missing', [])).toBe('cat:missing')
  })

  describe('defaultDir', () => {
    // Text reads naturally A→Z; everything else is more useful newest or
    // highest first.
    it.each(['name', 'creator', 'status', 'length', 'songName', 'songArtist'])(
      'starts %s ascending',
      (key) => {
        expect(defaultDir(key as never)).toBe('asc')
      }
    )

    it.each(['date', 'rating', 'enjoyment', 'attempts', 'tier', 'coins'])(
      'starts %s descending',
      (key) => {
        expect(defaultDir(key as never)).toBe('desc')
      }
    )

    it('starts a per-category sort descending', () => {
      expect(defaultDir('cat:gameplay')).toBe('desc')
    })

    it('gives every declared sort key a direction', () => {
      for (const option of LIST_SORT_OPTIONS) {
        expect(['asc', 'desc']).toContain(defaultDir(option.key))
      }
    })
  })
})

describe('gddlTierColor', () => {
  const rgb = (tier: number) =>
    gddlTierColor(tier).match(/\d+/g)!.map(Number) as [number, number, number]

  it('renders an rgb() string', () => {
    expect(gddlTierColor(10)).toMatch(/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/)
  })

  it('lands exactly on an anchor colour', () => {
    expect(rgb(1)).toEqual([222, 223, 237])
    expect(rgb(39)).toEqual([33, 8, 46])
  })

  // Tiers between anchors interpolate, so a midpoint sits between its
  // neighbours rather than snapping to one of them.
  it('interpolates between two anchors', () => {
    const [r] = rgb(3)

    expect(r).toBeLessThan(222)
    expect(r).toBeGreaterThan(207)
  })

  // Outside the anchor range the palette clamps rather than extrapolating
  // into nonsense values.
  it.each([0, -5, 1])('clamps tier %s to the lightest anchor', (tier) => {
    expect(rgb(tier)).toEqual([222, 223, 237])
  })

  it.each([39, 50, 999])('clamps tier %s to the darkest anchor', (tier) => {
    expect(rgb(tier)).toEqual([33, 8, 46])
  })

  it('produces integer channels', () => {
    for (const channel of rgb(7)) {
      expect(Number.isInteger(channel)).toBe(true)
    }
  })

  // The palette only darkens from 16 up — callers rely on that to decide
  // whether to render the tier number in black or white.
  it('keeps the low tiers lighter than the high ones', () => {
    const brightness = (t: number) =>
      rgb(t).reduce((sum, channel) => sum + channel, 0)

    expect(brightness(1)).toBeGreaterThan(brightness(20))
    expect(brightness(20)).toBeGreaterThan(brightness(39))
  })
})

describe('gddlTrackGradient', () => {
  it('renders a left-to-right gradient', () => {
    expect(gddlTrackGradient(1, 39)).toMatch(/^linear-gradient\(90deg, /)
  })

  it('places one stop per anchor', () => {
    const stops = gddlTrackGradient(1, 39).match(/rgb\([^)]*\) [\d.]+%/g)!

    expect(stops).toHaveLength(9)
  })

  it('spans the full track across the whole domain', () => {
    const gradient = gddlTrackGradient(1, 39)

    expect(gradient).toContain('0.0%')
    expect(gradient).toContain('100.0%')
  })

  // A narrowed slider still shows the whole palette, with the anchors outside
  // the window pinned to the ends rather than running off the track.
  it('clamps anchors outside a narrowed domain to the ends', () => {
    const gradient = gddlTrackGradient(10, 20)
    const percents = [...gradient.matchAll(/ ([\d.]+)%/g)].map((m) =>
      Number(m[1])
    )

    expect(Math.min(...percents)).toBe(0)
    expect(Math.max(...percents)).toBe(100)
    expect(percents.every((p) => p >= 0 && p <= 100)).toBe(true)
  })

  it('keeps the stops in ascending order', () => {
    const percents = [...gddlTrackGradient(1, 39).matchAll(/ ([\d.]+)%/g)].map(
      (m) => Number(m[1])
    )

    expect(percents).toEqual([...percents].sort((a, b) => a - b))
  })

  // A zero-width domain would divide by zero; the span floors at 1 instead.
  it('survives a domain with no width', () => {
    expect(() => gddlTrackGradient(10, 10)).not.toThrow()
    expect(gddlTrackGradient(10, 10)).toMatch(/^linear-gradient/)
  })
})
