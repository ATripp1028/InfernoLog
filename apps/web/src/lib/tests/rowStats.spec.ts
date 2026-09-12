import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEARCH_STATE,
  type LevelBrowseResult,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import { rowStat, rowStatKeys, rowStats, type RowStatKey } from '../rowStats'

const state = (overrides: Partial<SearchPageState> = {}): SearchPageState => ({
  ...DEFAULT_SEARCH_STATE,
  ...overrides,
})

function level(overrides: Partial<LevelBrowseResult> = {}): LevelBrowseResult {
  return {
    inGameId: '1',
    name: 'Level',
    creator: 'Creator',
    songName: null,
    inGameDifficulty: 'Extreme Demon',
    stars: 10,
    featured: false,
    epicValue: 0,
    isRated: true,
    likes: 0,
    downloads: 0,
    length: 'XL',
    coins: null,
    coinsVerified: null,
    twoPlayer: null,
    isDemon: true,
    levelType: 'CLASSIC',
    objectCount: null,
    gddlTier: null,
    aredlRank: null,
    aredlStatus: null,
    sheetTier: null,
    enjoyment: null,
    durationSeconds: null,
    gameVersion: null,
    ratingStatusSince: null,
    songType: null,
    ...overrides,
  }
}

describe('rowStatKeys', () => {
  it('adds nothing to a plain search', () => {
    expect(rowStatKeys(state())).toEqual([])
  })

  // Downloads, likes and length are always on the row; the face shows the
  // difficulty. Repeating them would only crowd it.
  it.each(['relevance', 'downloads', 'likes', 'stars', 'name'] as const)(
    'adds nothing for a %s sort the row already shows',
    (sort) => {
      expect(rowStatKeys(state({ sort }))).toEqual([])
    }
  )

  it.each([
    ['gddlTier', 'gddlTier'],
    ['aredlRank', 'aredlRank'],
    ['sheetTier', 'sheetTier'],
    ['enjoyment', 'enjoyment'],
    ['duration', 'duration'],
    ['objectCount', 'objectCount'],
    ['gameVersion', 'gameVersion'],
    ['recentlyRated', 'ratedAt'],
  ] as const)('shows the figure a %s sort orders by', (sort, key) => {
    expect(rowStatKeys(state({ sort }))).toEqual([key])
  })

  it.each([
    [{ gddlTierMin: 10 }, 'gddlTier'],
    [{ aredlRankMax: 100 }, 'aredlRank'],
    [{ enjoymentMin: 50 }, 'enjoyment'],
    [{ durationMax: 120 }, 'duration'],
    [{ objectCountMin: 1 }, 'objectCount'],
    [{ gameVersionMin: 2.1 }, 'gameVersion'],
    [{ sheetTier: 0 }, 'sheetTier'],
    [{ coinCount: [3] }, 'coins'],
    [{ coinsVerified: false }, 'coins'],
    [{ twoPlayer: false }, 'twoPlayer'],
    [{ songType: 'nong' }, 'song'],
  ] as const)('shows the figure %o filters on', (filter, key) => {
    expect(rowStatKeys(state(filter as Partial<SearchPageState>))).toEqual([
      key,
    ])
  })

  it('adds nothing for a downloads range, which the row already shows', () => {
    expect(rowStatKeys(state({ downloadsMin: 1000 }))).toEqual([])
  })

  it('leads with the sort, then the filters', () => {
    expect(
      rowStatKeys(state({ sort: 'enjoyment', gddlTierMin: 10, twoPlayer: true }))
    ).toEqual(['enjoyment', 'gddlTier', 'twoPlayer'])
  })

  it('shows a figure once when it is both sorted and filtered on', () => {
    expect(rowStatKeys(state({ sort: 'gddlTier', gddlTierMax: 20 }))).toEqual([
      'gddlTier',
    ])
  })
})

describe('rowStat', () => {
  // The chip itself is lib/communityTiers' business — what rowStat owes is
  // handing the right list's chip back under the 'tier' kind.
  it('paints a GDDL tier as its badge', () => {
    const stat = rowStat(level({ gddlTier: 20 }), 'gddlTier')

    expect(stat).toMatchObject({
      kind: 'tier',
      chip: { key: 'gddl', look: { badge: '20' } },
    })
  })

  // Under a sort by it, an unknown value is why the row sits where it does, so
  // it shows as a dash rather than vanishing.
  it.each([
    'gddlTier',
    'aredlRank',
    'sheetTier',
    'enjoyment',
    'duration',
    'objectCount',
    'gameVersion',
    'ratedAt',
    'coins',
    'twoPlayer',
    'song',
  ] as RowStatKey[])('shows an unknown %s as a blank value', (key) => {
    expect(rowStat(level(), key)).toMatchObject({ kind: 'text', value: null })
  })

  it('shows a main-list AREDL rank', () => {
    expect(
      rowStat(level({ aredlRank: 12, aredlStatus: 'MainList' }), 'aredlRank')
    ).toMatchObject({
      kind: 'tier',
      chip: { label: 'AREDL rank', look: { badge: '#12' } },
    })
  })

  // A Legacy position is a list index, not a rank.
  it('shows a Legacy entry as its status', () => {
    expect(
      rowStat(level({ aredlRank: 1580, aredlStatus: 'Legacy' }), 'aredlRank')
    ).toMatchObject({ chip: { label: 'AREDL status', look: { badge: 'Legacy' } } })
  })

  it.each([
    [0, 'Fuck', 'NLW'],
    [14, 'Merciless', 'LW'],
  ] as const)('names sheet tier %s and marks its sheet', (tier, name, source) => {
    expect(rowStat(level({ sheetTier: tier }), 'sheetTier')).toMatchObject({
      kind: 'tier',
      chip: { look: { badge: name }, source },
    })
  })

  it.each([
    [{ enjoyment: 49.5 }, 'enjoyment', '49.5'],
    [{ durationSeconds: 125 }, 'duration', '2:05'],
    [{ objectCount: 12345 }, 'objectCount', '12,345'],
    [{ gameVersion: '2.2' }, 'gameVersion', '2.2'],
    [{ coins: 3, coinsVerified: true }, 'coins', '3 coins, verified'],
    [{ coins: 1, coinsVerified: false }, 'coins', '1 coin, unverified'],
    [{ coins: 0, coinsVerified: false }, 'coins', '0 coins'],
    [{ twoPlayer: true }, 'twoPlayer', 'Yes'],
    [{ songType: 'nong' }, 'song', 'NONG'],
    [{ songType: 'custom' }, 'song', 'Newgrounds'],
  ] as const)('reads %o as %s %p', (overrides, key, expected) => {
    expect(
      rowStat(level(overrides as Partial<LevelBrowseResult>), key)
    ).toMatchObject({ value: expected })
  })

  it('dates the rating, spelled out so no date order can misread it', () => {
    expect(
      rowStat(level({ ratingStatusSince: '2026-09-03T12:00:00.000Z' }), 'ratedAt')
    ).toMatchObject({ label: 'Rated', value: 'Sep 3, 2026' })
  })

  it('labels the date of an unrating as such', () => {
    expect(
      rowStat(
        level({ isRated: false, ratingStatusSince: '2026-09-03T12:00:00.000Z' }),
        'ratedAt'
      )
    ).toMatchObject({ label: 'Unrated' })
  })
})

describe('rowStats', () => {
  it('reads the figures in the order asked', () => {
    const stats = rowStats(level({ enjoyment: 80, gddlTier: 5 }), [
      'enjoyment',
      'gddlTier',
    ])

    expect(stats.map((s) => s.key)).toEqual(['enjoyment', 'gddlTier'])
  })
})
