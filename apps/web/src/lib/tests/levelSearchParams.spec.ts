import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEARCH_STATE,
  DIFFICULTY_OPTIONS,
  LENGTH_OPTIONS,
  LEVEL_SORT_OPTIONS,
  LEVEL_TYPE_OPTIONS,
  RATE_STATUS_OPTIONS,
  SEARCH_BY_OPTIONS,
  SONG_TYPE_OPTIONS,
  browseApiQueryString,
  canEscalateToGd,
  effectiveSortDir,
  hasActiveFilters,
  naturalSortDir,
  reconcileExtremeSort,
  sortSelectionPatch,
  validateSearchState,
  type SearchPageState,
} from '../levelSearchParams'

const state = (overrides: Partial<SearchPageState> = {}): SearchPageState => ({
  ...DEFAULT_SEARCH_STATE,
  ...overrides,
})

describe('the option tables', () => {
  it.each([
    ['difficulty', DIFFICULTY_OPTIONS],
    ['rate status', RATE_STATUS_OPTIONS],
    ['length', LENGTH_OPTIONS],
    ['song type', SONG_TYPE_OPTIONS],
    ['level type', LEVEL_TYPE_OPTIONS],
    ['sort', LEVEL_SORT_OPTIONS],
    ['search-by', SEARCH_BY_OPTIONS],
  ])('declares each %s value exactly once, with a label', (_label, options) => {
    const values = options.map((o) => o.value)

    expect(new Set(values).size).toBe(values.length)
    expect(options.every((o) => o.label.length > 0)).toBe(true)
  })
})

describe('sort direction', () => {
  // Names read A→Z; everything else is more useful highest-first.
  it('starts a name sort ascending', () => {
    expect(naturalSortDir('name')).toBe('asc')
  })

  it.each([
    'relevance',
    'downloads',
    'likes',
    'stars',
    'gddlTier',
    'sheetTier',
    'enjoyment',
    'duration',
    'objectCount',
    'gameVersion',
  ] as const)('starts a %s sort descending', (sort) => {
    expect(naturalSortDir(sort)).toBe('desc')
  })

  // AREDL rank 1 is the hardest level, so the list reads top-down.
  it('starts an AREDL rank sort ascending', () => {
    expect(naturalSortDir('aredlRank')).toBe('asc')
  })

  it('gives every declared sort a natural direction', () => {
    for (const option of LEVEL_SORT_OPTIONS) {
      expect(['asc', 'desc']).toContain(naturalSortDir(option.value))
    }
  })

  it('uses the natural direction when the user has not toggled', () => {
    expect(effectiveSortDir(state({ sort: 'name' }))).toBe('asc')
    expect(effectiveSortDir(state({ sort: 'downloads' }))).toBe('desc')
  })

  it('lets an explicit toggle override it', () => {
    expect(effectiveSortDir(state({ sort: 'name', sortDir: 'desc' }))).toBe(
      'desc'
    )
    expect(effectiveSortDir(state({ sort: 'downloads', sortDir: 'asc' }))).toBe(
      'asc'
    )
  })
})

describe('sortSelectionPatch', () => {
  it('sets the sort with its natural direction', () => {
    expect(sortSelectionPatch('name')).toEqual({ sort: 'name', sortDir: 'asc' })
    expect(sortSelectionPatch('likes')).toEqual({
      sort: 'likes',
      sortDir: 'desc',
    })
  })

  // AREDL and the NLW/LW sheets rank nothing but extreme demons.
  it.each(['aredlRank', 'sheetTier'] as const)(
    'narrows a %s sort to extreme demons',
    (sort) => {
      expect(sortSelectionPatch(sort).difficulty).toEqual(['demon-extreme'])
    }
  )

  it('replaces the difficulty selection rather than adding to it', () => {
    const next = {
      ...state({ difficulty: ['easy', 'demon-hard'] }),
      ...sortSelectionPatch('aredlRank'),
    }

    expect(next.difficulty).toEqual(['demon-extreme'])
  })

  it('leaves the difficulty filter alone for any other sort', () => {
    expect(sortSelectionPatch('gddlTier')).not.toHaveProperty('difficulty')
  })
})

// AREDL and the sheets place nothing but extremes, so their sorts only mean
// something while the difficulty filter says Extreme Demon alone.
describe('reconcileExtremeSort', () => {
  it.each(['aredlRank', 'sheetTier'] as const)(
    'keeps a %s sort while the filter is Extreme Demon only',
    (sort) => {
      const s = state({ sort, sortDir: 'desc', difficulty: ['demon-extreme'] })

      expect(reconcileExtremeSort(s)).toBe(s)
    }
  )

  it.each([
    ['cleared', undefined],
    ['widened', ['demon-extreme', 'demon-insane']],
    ['moved', ['demon-hard']],
  ] as const)(
    'drops the sort once the Extreme Demon filter is %s',
    (_label, difficulty) => {
      const next = reconcileExtremeSort(
        state({
          sort: 'aredlRank',
          sortDir: 'desc',
          difficulty: difficulty as never,
        })
      )

      expect(next.sort).toBe('relevance')
      expect(next.sortDir).toBeUndefined()
    }
  )

  // The reported bug: Clear all kept the sort and let every non-extreme in.
  it('drops the sort when the filters are cleared', () => {
    const cleared = { query: undefined, searchBy: 'name', sort: 'sheetTier' }

    expect(reconcileExtremeSort(cleared as SearchPageState).sort).toBe(
      'relevance'
    )
  })

  it('leaves the filters alone', () => {
    expect(
      reconcileExtremeSort(state({ sort: 'aredlRank', twoPlayer: true }))
        .twoPlayer
    ).toBe(true)
  })

  it('leaves every other sort alone', () => {
    const s = state({ sort: 'gddlTier' })

    expect(reconcileExtremeSort(s)).toBe(s)
  })

  it('survives the very patch that picks the sort', () => {
    expect(
      reconcileExtremeSort({ ...state(), ...sortSelectionPatch('aredlRank') })
        .sort
    ).toBe('aredlRank')
  })
})

describe('hasActiveFilters', () => {
  it('reports nothing set on a fresh state', () => {
    expect(hasActiveFilters(state())).toBe(false)
  })

  it.each([
    ['difficulty', { difficulty: ['demon-extreme'] }],
    ['rate status', { rateStatus: ['featured'] }],
    ['length', { length: ['long'] }],
    ['coin count', { coinCount: [3] }],
    ['two player', { twoPlayer: true }],
    ['verified coins', { coinsVerified: true }],
    ['level type', { levelType: 'CLASSIC' }],
    ['song type', { songType: 'nong' }],
    ['range lower bound', { downloadsMin: 1000 }],
    ['range upper bound', { gddlTierMax: 20 }],
    ['sheet tier', { sheetTier: 14 }],
    // Tier 0 is a real tier, not an absent filter.
    ['sheet tier 0', { sheetTier: 0 }],
  ] as const)('notices a %s filter', (_label, patch) => {
    expect(hasActiveFilters(state(patch as never))).toBe(true)
  })

  // `false` is a real constraint — it means "two-player levels only, no" —
  // so it must not read as absent.
  it.each(['twoPlayer', 'coinsVerified'] as const)(
    'notices a %s filter set to false',
    (field) => {
      expect(hasActiveFilters(state({ [field]: false }))).toBe(true)
    }
  )

  // An emptied array should have collapsed to undefined; if one slips through
  // it still means "no constraint".
  it.each(['difficulty', 'rateStatus', 'length', 'coinCount'] as const)(
    'treats an empty %s array as no filter',
    (field) => {
      expect(hasActiveFilters(state({ [field]: [] }))).toBe(false)
    }
  )

  // Query, search-by and sort are not filters — they are the search itself.
  it('ignores the query, the mode, and the sort', () => {
    expect(
      hasActiveFilters(
        state({ query: 'bloodbath', searchBy: 'creator', sort: 'likes' })
      )
    ).toBe(false)
  })
})

// Mirrors the API's browse-intent gate: only the subset getGJLevels21 can
// express is forwardable, and anything else is a 400.
describe('canEscalateToGd', () => {
  it('forwards a name query', () => {
    expect(canEscalateToGd(state({ query: 'bloodbath' }))).toBe(true)
  })

  it('does not forward a whitespace-only query', () => {
    expect(canEscalateToGd(state({ query: '   ' }))).toBe(false)
  })

  // GD has no creator search, so in creator mode only the filters count.
  it('does not forward a creator query', () => {
    expect(canEscalateToGd(state({ query: 'riot', searchBy: 'creator' }))).toBe(
      false
    )
  })

  it('still forwards a filter while in creator mode', () => {
    expect(
      canEscalateToGd(
        state({ query: 'riot', searchBy: 'creator', difficulty: ['easy'] })
      )
    ).toBe(true)
  })

  it.each([
    ['difficulty', { difficulty: ['demon-extreme'] }],
    ['rate status', { rateStatus: ['featured'] }],
    ['length', { length: ['long'] }],
    ['two player', { twoPlayer: true }],
    ['a downloads sort', { sort: 'downloads' }],
    ['a likes sort', { sort: 'likes' }],
    ['a custom-song filter', { songType: 'custom' }],
  ] as const)('forwards %s', (_label, patch) => {
    expect(canEscalateToGd(state(patch as never))).toBe(true)
  })

  // GD can express "has coins", not "has exactly N" — so a non-zero count is
  // forwardable but a zero-only filter is not.
  it('forwards a coin-count filter asking for coins', () => {
    expect(canEscalateToGd(state({ coinCount: [1, 2, 3] }))).toBe(true)
  })

  it('does not forward a coin-count filter asking for none', () => {
    expect(canEscalateToGd(state({ coinCount: [0] }))).toBe(false)
  })

  // Cache-only refinements have no GD equivalent, so they cannot carry an
  // escalation on their own.
  it.each([
    ['verified coins', { coinsVerified: true }],
    ['level type', { levelType: 'CLASSIC' }],
    ['an official-song filter', { songType: 'official' }],
    ['a NONG filter', { songType: 'nong' }],
    ['a stars sort', { sort: 'stars' }],
    ['an object-count sort', { sort: 'objectCount' }],
    ['a GDDL tier sort', { sort: 'gddlTier' }],
    ['a range bound', { downloadsMin: 1000 }],
    ['a sheet tier', { sheetTier: 14 }],
  ] as const)('does not forward %s alone', (_label, patch) => {
    expect(canEscalateToGd(state(patch as never))).toBe(false)
  })

  it('forwards nothing on a fresh state', () => {
    expect(canEscalateToGd(state())).toBe(false)
  })
})

// The URL is the source of truth, so a hand-edited one must not crash the
// page — anything unrecognized is dropped rather than trusted.
describe('validateSearchState', () => {
  it('falls back to the defaults for an empty URL', () => {
    expect(validateSearchState({})).toMatchObject({
      searchBy: 'name',
      sort: 'relevance',
    })
  })

  it('keeps a well-formed state intact', () => {
    const raw = {
      query: 'bloodbath',
      searchBy: 'creator',
      sort: 'likes',
      sortDir: 'asc',
      difficulty: ['demon-extreme'],
      twoPlayer: true,
    }

    expect(validateSearchState(raw)).toMatchObject(raw)
  })

  it.each([
    ['searchBy', 'nonsense', 'searchBy', 'name'],
    ['sort', 'nonsense', 'sort', 'relevance'],
  ])('falls back for an unrecognized %s', (field, value, key, expected) => {
    expect(validateSearchState({ [field]: value })[key as 'sort']).toBe(
      expected
    )
  })

  // A shared or hand-edited URL can name the sort without its filter.
  it('drops an extremes-only sort that arrives without its filter', () => {
    expect(validateSearchState({ sort: 'aredlRank' }).sort).toBe('relevance')
  })

  it('keeps an extremes-only sort that arrives with its filter', () => {
    expect(
      validateSearchState({ sort: 'aredlRank', difficulty: ['demon-extreme'] })
        .sort
    ).toBe('aredlRank')
  })

  it('drops an unrecognized sort direction rather than defaulting it', () => {
    expect(validateSearchState({ sortDir: 'sideways' }).sortDir).toBeUndefined()
  })

  it('drops an empty query, so it reads as absent', () => {
    expect(validateSearchState({ query: '' }).query).toBeUndefined()
  })

  it('drops a non-string query', () => {
    expect(validateSearchState({ query: 42 }).query).toBeUndefined()
  })

  describe('array filters', () => {
    it('keeps the recognized values and drops the rest', () => {
      expect(
        validateSearchState({ difficulty: ['easy', 'nonsense', 'hard'] })
          .difficulty
      ).toEqual(['easy', 'hard'])
    })

    // An array with nothing usable collapses to undefined, which is what the
    // rest of the code reads as "no constraint".
    it('collapses an all-invalid array to nothing', () => {
      expect(
        validateSearchState({ difficulty: ['nonsense'] }).difficulty
      ).toBeUndefined()
    })

    it('drops a non-array value', () => {
      expect(
        validateSearchState({ difficulty: 'easy' }).difficulty
      ).toBeUndefined()
    })
  })

  describe('the coin-count filter', () => {
    it('keeps whole numbers in range', () => {
      expect(
        validateSearchState({ coinCount: [0, 1, 2, 3] }).coinCount
      ).toEqual([0, 1, 2, 3])
    })

    // A level has at most three coins, so anything else is a hand-edited URL.
    it.each([[-1], [4], [99]])('drops the out-of-range value %s', (n) => {
      expect(validateSearchState({ coinCount: [n] }).coinCount).toBeUndefined()
    })

    it('drops a fractional count', () => {
      expect(
        validateSearchState({ coinCount: [1.5] }).coinCount
      ).toBeUndefined()
    })

    it('coerces a numeric string, since the URL carries text', () => {
      expect(validateSearchState({ coinCount: ['2'] }).coinCount).toEqual([2])
    })

    it('drops unparseable text', () => {
      expect(
        validateSearchState({ coinCount: ['many'] }).coinCount
      ).toBeUndefined()
    })
  })

  describe('boolean filters', () => {
    // The URL carries strings; the router may hand back real booleans.
    it.each([
      [true, true],
      ['true', true],
      [false, false],
      ['false', false],
    ])('reads %p as %p', (raw, expected) => {
      expect(validateSearchState({ twoPlayer: raw }).twoPlayer).toBe(expected)
    })

    it.each(['yes', '1', 42, null])('drops the unusable value %p', (raw) => {
      expect(
        validateSearchState({ twoPlayer: raw as never }).twoPlayer
      ).toBeUndefined()
    })
  })

  // Checked against core's own limits, so a hand-edited bound is dropped here
  // instead of earning a 400 the grid would show as a failed search.
  describe('range bounds', () => {
    it('keeps a bound the API would accept', () => {
      expect(
        validateSearchState({ downloadsMin: 1000, gddlTierMax: 5 })
      ).toMatchObject({ downloadsMin: 1000, gddlTierMax: 5 })
    })

    it('coerces a numeric string, since the URL carries text', () => {
      expect(validateSearchState({ gddlTierMin: '20' }).gddlTierMin).toBe(20)
    })

    it('keeps a fraction where the field allows one', () => {
      expect(validateSearchState({ enjoymentMin: 49.5 }).enjoymentMin).toBe(
        49.5
      )
      expect(validateSearchState({ gameVersionMax: 2.1 }).gameVersionMax).toBe(
        2.1
      )
    })

    it.each([
      ['beyond the field’s limit', { enjoymentMax: 101 }, 'enjoymentMax'],
      ['below it', { gddlTierMin: 0 }, 'gddlTierMin'],
      ['fractional on a whole-number field', { downloadsMin: 1.5 }, 'downloadsMin'],
      ['unparseable', { likesMin: 'lots' }, 'likesMin'],
      ['blank', { likesMin: '' }, 'likesMin'],
      ['non-finite', { likesMax: Number.POSITIVE_INFINITY }, 'likesMax'],
    ] as const)('drops a bound that is %s', (_label, raw, key) => {
      expect(validateSearchState(raw)[key]).toBeUndefined()
    })

    // Likes are net of dislikes, so a negative bound is legitimate.
    it('keeps a negative likes bound', () => {
      expect(validateSearchState({ likesMax: -5 }).likesMax).toBe(-5)
    })
  })

  describe('the sheet tier', () => {
    it.each([
      [14, 14],
      ['14', 14],
      // Tier 0 is a real tier, so it must not fall out as falsy.
      [0, 0],
      ['0', 0],
    ])('keeps %p as tier %s', (raw, expected) => {
      expect(validateSearchState({ sheetTier: raw }).sheetTier).toBe(expected)
    })

    it.each([22, -1, 1.5, '', 'Nightmare', null])(
      'drops %p, which is not a tier on the ladder',
      (raw) => {
        expect(
          validateSearchState({ sheetTier: raw as never }).sheetTier
        ).toBeUndefined()
      }
    )
  })

  it('survives a URL of complete nonsense', () => {
    expect(() =>
      validateSearchState({
        query: {},
        searchBy: [],
        sort: null,
        difficulty: 42,
        coinCount: 'lots',
        twoPlayer: {},
      })
    ).not.toThrow()
  })
})

describe('browseApiQueryString', () => {
  const params = (s: SearchPageState, cursor?: string) =>
    new URLSearchParams(browseApiQueryString(s, cursor))

  it('always sends the mode and the sort', () => {
    const p = params(state())

    expect(p.get('searchBy')).toBe('name')
    expect(p.get('sort')).toBe('relevance')
  })

  it('sends the query trimmed, under its own key', () => {
    expect(params(state({ query: '  bloodbath  ' })).get('q')).toBe('bloodbath')
  })

  it('omits a whitespace-only query', () => {
    expect(params(state({ query: '   ' })).has('q')).toBe(false)
  })

  // The natural direction is the server's own default, so only an explicit
  // toggle needs sending.
  it('omits the direction unless the user toggled it', () => {
    expect(params(state({ sort: 'name' })).has('sortDir')).toBe(false)
    expect(
      params(state({ sort: 'name', sortDir: 'desc' })).get('sortDir')
    ).toBe('desc')
  })

  it('repeats an array filter once per value', () => {
    const p = params(state({ difficulty: ['easy', 'hard'] }))

    expect(p.getAll('difficulty')).toEqual(['easy', 'hard'])
  })

  it.each([
    ['rateStatus', { rateStatus: ['featured', 'epic'] }],
    ['length', { length: ['tiny', 'xl'] }],
  ] as const)('repeats the %s filter', (key, patch) => {
    expect(params(state(patch as never)).getAll(key)).toHaveLength(2)
  })

  it('sends coin counts as strings', () => {
    expect(params(state({ coinCount: [0, 3] })).getAll('coinCount')).toEqual([
      '0',
      '3',
    ])
  })

  it.each([
    [true, 'true'],
    [false, 'false'],
  ])('sends the boolean %p as %p', (value, expected) => {
    expect(params(state({ twoPlayer: value })).get('twoPlayer')).toBe(expected)
  })

  it('omits a boolean that was never set', () => {
    expect(params(state()).has('twoPlayer')).toBe(false)
  })

  it('sends the single-value filters', () => {
    const p = params(state({ levelType: 'CLASSIC', songType: 'nong' }))

    expect(p.get('levelType')).toBe('CLASSIC')
    expect(p.get('songType')).toBe('nong')
  })

  it('sends the keyset cursor when paging', () => {
    expect(params(state(), 'abc123').get('cursor')).toBe('abc123')
  })

  it('omits the cursor on the first page', () => {
    expect(params(state()).has('cursor')).toBe(false)
  })

  it('sends each range bound under its own key', () => {
    const p = params(state({ downloadsMin: 1000, enjoymentMax: 49.5 }))

    expect(p.get('downloadsMin')).toBe('1000')
    expect(p.get('enjoymentMax')).toBe('49.5')
  })

  it('sends a zero bound rather than dropping it', () => {
    expect(params(state({ likesMin: 0 })).get('likesMin')).toBe('0')
  })

  it('sends the sheet tier, tier 0 included', () => {
    expect(params(state({ sheetTier: 0 })).get('sheetTier')).toBe('0')
    expect(params(state()).has('sheetTier')).toBe(false)
  })

  it('omits the bounds that are unset', () => {
    expect(params(state({ downloadsMin: 1000 })).has('downloadsMax')).toBe(
      false
    )
  })

  // The URL is the source of truth, so what the page serializes has to come
  // back through validation unchanged.
  it('round-trips a fully-specified state through validation', () => {
    const original = state({
      query: 'bloodbath',
      searchBy: 'creator',
      sort: 'likes',
      sortDir: 'asc',
      difficulty: ['easy', 'hard'],
      rateStatus: ['featured'],
      length: ['long'],
      coinCount: [1, 2],
      twoPlayer: true,
      coinsVerified: false,
      levelType: 'CLASSIC',
      songType: 'nong',
      downloadsMin: 1000,
      gddlTierMax: 20,
      enjoymentMin: 49.5,
      gameVersionMin: 2.1,
      sheetTier: 0,
    })
    const p = params(original)

    const revalidated = validateSearchState({
      downloadsMin: p.get('downloadsMin'),
      gddlTierMax: p.get('gddlTierMax'),
      enjoymentMin: p.get('enjoymentMin'),
      gameVersionMin: p.get('gameVersionMin'),
      sheetTier: p.get('sheetTier'),
      query: p.get('q') ?? undefined,
      searchBy: p.get('searchBy'),
      sort: p.get('sort'),
      sortDir: p.get('sortDir') ?? undefined,
      difficulty: p.getAll('difficulty'),
      rateStatus: p.getAll('rateStatus'),
      length: p.getAll('length'),
      coinCount: p.getAll('coinCount'),
      twoPlayer: p.get('twoPlayer'),
      coinsVerified: p.get('coinsVerified'),
      levelType: p.get('levelType'),
      songType: p.get('songType'),
    })

    expect(revalidated).toEqual(original)
  })
})
