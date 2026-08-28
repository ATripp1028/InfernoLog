import { describe, expect, it } from 'vitest'
import {
  applyFilters,
  countActiveFilters,
  difficultyRank,
  gddlTier,
  isRangeActive,
  sortItems,
} from '../filtering'
import {
  ATTEMPTS_DOMAIN,
  RATING_DOMAIN,
  TIER_DOMAIN,
  type LogItem,
  type SortSpec,
} from '../types'
import { entry, filters, item, level } from './fixtures'

/** Ids of the rows that survived the filter. */
const kept = (items: LogItem[], f = filters(), search = '') =>
  applyFilters(items, f, search).map((i) => i.level.inGameId)

describe('gddlTier', () => {
  it('reads the user’s own tier opinion', () => {
    expect(gddlTier(item({ userGddlTier: 24 }))).toBe(24)
  })

  it('reports nothing when no opinion was logged', () => {
    expect(gddlTier(item({ userGddlTier: null }))).toBeNull()
  })
})

describe('difficultyRank', () => {
  // The labels do not sort alphabetically into game order, which is the whole
  // reason this table exists.
  it('orders the difficulties easy to hard', () => {
    const ranks = [
      'Auto',
      'Easy',
      'Normal',
      'Hard',
      'Harder',
      'Insane',
      'Easy Demon',
      'Medium Demon',
      'Hard Demon',
      'Insane Demon',
      'Extreme Demon',
    ].map((d) => difficultyRank(d)!)

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('ranks every demon above every non-demon', () => {
    expect(difficultyRank('Easy Demon')!).toBeGreaterThan(
      difficultyRank('Insane')!
    )
  })

  it.each([
    ['an unknown difficulty', 'Nonsense'],
    ['an unrated level', null],
  ])('reports no rank for %s', (_label, difficulty) => {
    expect(difficultyRank(difficulty)).toBeNull()
  })
})

describe('isRangeActive', () => {
  it('reports an untouched range as inactive', () => {
    expect(isRangeActive([...RATING_DOMAIN], RATING_DOMAIN)).toBe(false)
  })

  it.each([
    ['the lower bound raised', [10, 100]],
    ['the upper bound lowered', [0, 90]],
    ['both bounds moved', [10, 90]],
  ])('reports %s as active', (_label, range) => {
    expect(isRangeActive(range as [number, number], RATING_DOMAIN)).toBe(true)
  })
})

describe('applyFilters', () => {
  describe('search', () => {
    const rows = [
      item({
        level: level({ inGameId: '1', name: 'Bloodbath', creator: 'Riot' }),
      }),
      item({
        level: level({
          inGameId: '2',
          name: 'Cataclysm',
          creator: 'Ggb0y',
          songName: 'At the Speed of Light',
          songAuthor: 'Dimrain47',
        }),
      }),
    ]

    it.each([
      ['a name', 'blood', ['1']],
      ['a creator', 'ggb', ['2']],
      ['a level id', '2', ['2']],
      ['a song name', 'speed of light', ['2']],
      ['a song artist', 'dimrain', ['2']],
    ])('matches on %s', (_label, q, expected) => {
      expect(kept(rows, filters(), q)).toEqual(expected)
    })

    it('ignores case and surrounding whitespace', () => {
      expect(kept(rows, filters(), '  BLOODBATH  ')).toEqual(['1'])
    })

    it('keeps everything for an empty search', () => {
      expect(kept(rows, filters(), '   ')).toEqual(['1', '2'])
    })

    it('drops everything when nothing matches', () => {
      expect(kept(rows, filters(), 'zzzz')).toEqual([])
    })
  })

  // Every list filter treats "nothing selected" as "no constraint" rather
  // than "match nothing".
  describe('multi-select filters', () => {
    /** A row matching the named filter, next to one that does not. */
    const pair = (matching: Partial<LogItem>) => {
      const yes = item(matching)
      yes.level.inGameId = 'yes'
      const no = item({
        level: level({
          inGameId: 'no',
          length: 'Tiny',
          gameVersion: '2.2',
          inGameDifficulty: 'Auto',
          levelType: 'CLASSIC',
        }),
        status: 'DROPPED',
        entry: entry({ device: 'mobile' }),
      })
      return [yes, no]
    }

    it.each([
      ['statuses', { statuses: ['COMPLETED'] }, { status: 'COMPLETED' }],
      ['lengths', { lengths: ['Long'] }, { level: level({ length: 'Long' }) }],
      [
        'gameVersions',
        { gameVersions: ['2.1'] },
        { level: level({ gameVersion: '2.1' }) },
      ],
      [
        'difficulties',
        { difficulties: ['Easy Demon'] },
        { level: level({ inGameDifficulty: 'Easy Demon' }) },
      ],
      [
        'levelTypes',
        { levelTypes: ['PLATFORMER'] },
        { level: level({ levelType: 'PLATFORMER' }) },
      ],
      ['devices', { devices: ['pc'] }, { entry: entry({ device: 'pc' }) }],
    ] as const)('constrains on %s when set', (_label, filter, matching) => {
      expect(
        kept(pair(matching as Partial<LogItem>), filters(filter as never))
      ).toEqual(['yes'])
    })

    it.each([
      'statuses',
      'lengths',
      'gameVersions',
      'difficulties',
      'levelTypes',
      'devices',
    ])('treats an empty %s selection as no constraint', (key) => {
      const rows = [item({ level: level({ inGameId: '1' }) })]

      expect(kept(rows, filters({ [key]: [] } as never))).toEqual(['1'])
    })

    // A row whose value is absent cannot satisfy a constraint on that value.
    it.each([
      ['length', { lengths: ['Long'] }, { level: level({ length: null }) }],
      [
        'game version',
        { gameVersions: ['2.1'] },
        { level: level({ gameVersion: null }) },
      ],
      [
        'difficulty',
        { difficulties: ['Easy Demon'] },
        { level: level({ inGameDifficulty: null }) },
      ],
      ['device', { devices: ['pc'] }, { entry: entry({ device: null }) }],
    ] as const)('drops a row with no %s', (_label, filter, row) => {
      expect(kept([item(row as object)], filters(filter as never))).toEqual([])
    })
  })

  describe('rated status', () => {
    const rows = [
      item({ level: level({ inGameId: 'unrated', isRated: false }) }),
      item({ level: level({ inGameId: 'rated', isRated: true }) }),
      item({
        level: level({ inGameId: 'featured', isRated: true, featured: true }),
      }),
      item({ level: level({ inGameId: 'epic', epicValue: 1 }) }),
      item({ level: level({ inGameId: 'legendary', epicValue: 2 }) }),
      item({ level: level({ inGameId: 'mythic', epicValue: 3 }) }),
    ]

    it('keeps everything on ALL', () => {
      expect(kept(rows, filters({ ratedStatus: 'ALL' }))).toHaveLength(6)
    })

    it.each([
      ['UNRATED', ['unrated']],
      ['FEATURED', ['featured']],
      ['EPIC', ['epic']],
      ['LEGENDARY', ['legendary']],
      ['MYTHIC', ['mythic']],
    ] as const)('narrows to %s', (status, expected) => {
      expect(kept(rows, filters({ ratedStatus: status }))).toEqual(expected)
    })

    // RATED is the broad "has a rating at all" bucket, so it keeps the
    // featured/epic/legendary/mythic levels too — those are tiers ON TOP of
    // being rated, not alternatives to it.
    it('keeps every rated level on RATED, whatever its tier', () => {
      expect(kept(rows, filters({ ratedStatus: 'RATED' }))).toEqual([
        'rated',
        'featured',
        'epic',
        'legendary',
        'mythic',
      ])
    })
  })

  describe('status flags', () => {
    it.each([
      ['hasVideo', { entry: entry({ videoUrl: 'https://x' }) }],
      ['onStream', { entry: entry({ onStream: true }) }],
      ['uncertainDate', { entry: entry({ dateUncertain: true }) }],
      ['needsPlacement', { needsPlacement: true }],
      ['twoPlayer', { level: level({ twoPlayer: true }) }],
      ['hasCoins', { level: level({ coins: 3 }) }],
      ['verifiedCoins', { level: level({ coinsVerified: true }) }],
    ] as const)('constrains on %s', (flag, matching) => {
      const yes = item(matching as object)
      yes.level.inGameId = 'yes'
      const no = item({ level: level({ inGameId: 'no' }) })

      expect(kept([yes, no], filters({ flags: [flag] }))).toEqual(['yes'])
    })

    // Flags AND together — selecting two means both must hold.
    it('requires every selected flag', () => {
      const both = item({
        level: level({ inGameId: 'both', twoPlayer: true }),
        entry: entry({ onStream: true }),
      })
      const one = item({
        level: level({ inGameId: 'one', twoPlayer: true }),
        entry: entry({ onStream: false }),
      })

      expect(
        kept([both, one], filters({ flags: ['twoPlayer', 'onStream'] }))
      ).toEqual(['both'])
    })

    it('treats a level with zero coins as having none', () => {
      const row = item({ level: level({ inGameId: '1', coins: 0 }) })

      expect(kept([row], filters({ flags: ['hasCoins'] }))).toEqual([])
    })
  })

  describe('range filters', () => {
    it('keeps a row inside the range', () => {
      const row = item({
        level: level({ inGameId: '1' }),
        overallRating: 80,
      })

      expect(kept([row], filters({ rating: [70, 90] }))).toEqual(['1'])
    })

    it('includes both bounds', () => {
      const low = item({ level: level({ inGameId: 'low' }), overallRating: 70 })
      const high = item({
        level: level({ inGameId: 'high' }),
        overallRating: 90,
      })

      expect(kept([low, high], filters({ rating: [70, 90] }))).toEqual([
        'low',
        'high',
      ])
    })

    // A row with no value cannot satisfy a range, so it drops out once the
    // range is narrowed — but survives while the range is untouched.
    it('drops an unrated row once the rating range narrows', () => {
      const row = item({ level: level({ inGameId: '1' }), overallRating: null })

      expect(kept([row], filters())).toEqual(['1'])
      expect(kept([row], filters({ rating: [1, 100] }))).toEqual([])
    })

    it.each([
      [
        'enjoyment',
        { enjoyment: [50, 60] },
        { entry: entry({ enjoyment: 55 }) },
      ],
      ['tier', { tier: [20, 30] }, { userGddlTier: 24 }],
      [
        'attempts',
        { attempts: [100, 200] },
        { entry: entry({ attempts: 150 }) },
      ],
    ] as const)('constrains on %s', (_label, filter, matching) => {
      const yes = item(matching as object)
      yes.level.inGameId = 'yes'
      const no = item({ level: level({ inGameId: 'no' }) })

      expect(kept([yes, no], filters(filter as never))).toEqual(['yes'])
    })

    // The tier and attempts sliders top out below the real maximum, so an
    // over-domain value clamps INTO the top bucket rather than falling out.
    it('clamps a tier above the slider maximum into the top bucket', () => {
      const row = item({
        level: level({ inGameId: '1' }),
        userGddlTier: TIER_DOMAIN[1] + 10,
      })

      expect(kept([row], filters({ tier: [30, TIER_DOMAIN[1]] }))).toEqual([
        '1',
      ])
    })

    it('clamps attempts above the slider maximum into the top bucket', () => {
      const row = item({
        level: level({ inGameId: '1' }),
        entry: entry({ attempts: ATTEMPTS_DOMAIN[1] * 10 }),
      })

      expect(
        kept([row], filters({ attempts: [20000, ATTEMPTS_DOMAIN[1]] }))
      ).toEqual(['1'])
    })
  })

  describe('the date-beaten bounds', () => {
    const rows = [
      item({
        level: level({ inGameId: 'early' }),
        entry: entry({ date: '2026-01-01' }),
      }),
      item({
        level: level({ inGameId: 'late' }),
        entry: entry({ date: '2026-06-01' }),
      }),
      item({
        level: level({ inGameId: 'undated' }),
        entry: entry({ date: null }),
      }),
    ]

    it('keeps everything while both bounds are open', () => {
      expect(kept(rows, filters())).toHaveLength(3)
    })

    it('constrains on a lower bound', () => {
      expect(
        kept(
          rows,
          filters({
            dateBeaten: { from: Date.parse('2026-03-01'), to: null },
          })
        )
      ).toEqual(['late'])
    })

    it('constrains on an upper bound', () => {
      expect(
        kept(
          rows,
          filters({
            dateBeaten: { from: null, to: Date.parse('2026-03-01') },
          })
        )
      ).toEqual(['early'])
    })

    // An undated row cannot be placed within a window at all.
    it('drops an undated row once either bound is set', () => {
      expect(
        kept(rows, filters({ dateBeaten: { from: 0, to: null } }))
      ).not.toContain('undated')
    })
  })

  describe('per-category rating filters', () => {
    const scored = (id: string, score: number) =>
      item({
        level: level({ inGameId: id }),
        ratingScores: [{ categoryId: 'gameplay', score }],
      })

    it('constrains on one category', () => {
      const rows = [scored('high', 90), scored('low', 20)]

      expect(
        kept(rows, filters({ categoryRatings: { gameplay: [80, 100] } }))
      ).toEqual(['high'])
    })

    it('ignores a category whose range is untouched', () => {
      const rows = [scored('a', 10)]

      expect(
        kept(
          rows,
          filters({ categoryRatings: { gameplay: [...RATING_DOMAIN] } })
        )
      ).toEqual(['a'])
    })

    it('drops a row that was never scored on the constrained category', () => {
      const rows = [item({ level: level({ inGameId: '1' }), ratingScores: [] })]

      expect(
        kept(rows, filters({ categoryRatings: { gameplay: [80, 100] } }))
      ).toEqual([])
    })

    // Multiple category filters AND together.
    it('requires every constrained category', () => {
      const both = item({
        level: level({ inGameId: 'both' }),
        ratingScores: [
          { categoryId: 'gameplay', score: 90 },
          { categoryId: 'design', score: 90 },
        ],
      })
      const one = item({
        level: level({ inGameId: 'one' }),
        ratingScores: [
          { categoryId: 'gameplay', score: 90 },
          { categoryId: 'design', score: 10 },
        ],
      })

      expect(
        kept(
          [both, one],
          filters({
            categoryRatings: { gameplay: [80, 100], design: [80, 100] },
          })
        )
      ).toEqual(['both'])
    })
  })

  it('applies every active filter together', () => {
    const match = item({
      level: level({ inGameId: 'match', name: 'Bloodbath', length: 'Long' }),
      status: 'COMPLETED',
      overallRating: 90,
    })
    const wrongStatus = item({
      level: level({ inGameId: 'other', name: 'Bloodbath', length: 'Long' }),
      status: 'DROPPED',
      overallRating: 90,
    })

    expect(
      kept(
        [match, wrongStatus],
        filters({
          statuses: ['COMPLETED'],
          lengths: ['Long'],
          rating: [80, 100],
        }),
        'blood'
      )
    ).toEqual(['match'])
  })

  it('leaves the input array untouched', () => {
    const rows = [item(), item()]
    const before = [...rows]

    applyFilters(rows, filters({ statuses: ['COMPLETED'] }), '')

    expect(rows).toEqual(before)
  })
})

describe('countActiveFilters', () => {
  it('counts nothing for a fresh filter state', () => {
    expect(countActiveFilters(filters())).toBe(0)
  })

  it.each([
    ['statuses', { statuses: ['COMPLETED'] }],
    ['levelTypes', { levelTypes: ['CLASSIC'] }],
    ['devices', { devices: ['pc'] }],
    ['ratedStatus', { ratedStatus: 'FEATURED' }],
    ['flags', { flags: ['onStream'] }],
    ['lengths', { lengths: ['Long'] }],
    ['gameVersions', { gameVersions: ['2.1'] }],
    ['difficulties', { difficulties: ['Easy Demon'] }],
    ['rating', { rating: [10, 100] }],
    ['enjoyment', { enjoyment: [10, 100] }],
    ['tier', { tier: [10, 35] }],
    ['attempts', { attempts: [10, 25000] }],
    ['a date lower bound', { dateBeaten: { from: 1, to: null } }],
    ['a date upper bound', { dateBeaten: { from: null, to: 1 } }],
  ] as const)('counts %s as one group', (_label, filter) => {
    expect(countActiveFilters(filters(filter as never))).toBe(1)
  })

  // ALL is the "no constraint" value, so it must not count.
  it('does not count a rated status of ALL', () => {
    expect(countActiveFilters(filters({ ratedStatus: 'ALL' }))).toBe(0)
  })

  it('counts each constrained category separately', () => {
    expect(
      countActiveFilters(
        filters({
          categoryRatings: { gameplay: [10, 100], design: [20, 100] },
        })
      )
    ).toBe(2)
  })

  it('does not count a category left at its full domain', () => {
    expect(
      countActiveFilters(
        filters({ categoryRatings: { gameplay: [...RATING_DOMAIN] } })
      )
    ).toBe(0)
  })

  it('adds up every active group', () => {
    expect(
      countActiveFilters(
        filters({
          statuses: ['COMPLETED'],
          flags: ['onStream'],
          rating: [10, 100],
          categoryRatings: { gameplay: [10, 100] },
        })
      )
    ).toBe(4)
  })
})

describe('sortItems', () => {
  const sorted = (
    items: LogItem[],
    sorts: SortSpec[],
    cats: { id: string; sortOrder: number }[] = []
  ) => sortItems(items, sorts, cats).map((i) => i.level.inGameId)

  it('returns the rows untouched with no sorts', () => {
    const rows = [item({ level: level({ inGameId: 'b' }) })]

    expect(sortItems(rows, [])).toBe(rows)
  })

  it('leaves the input array untouched', () => {
    const rows = [
      item({ level: level({ inGameId: 'b', name: 'B' }) }),
      item({ level: level({ inGameId: 'a', name: 'A' }) }),
    ]
    const before = [...rows]

    sortItems(rows, [{ key: 'name', dir: 'asc' }])

    expect(rows).toEqual(before)
  })

  it.each([
    ['asc', ['a', 'b', 'c']],
    ['desc', ['c', 'b', 'a']],
  ] as const)('sorts names %s', (dir, expected) => {
    const rows = ['b', 'c', 'a'].map((n) =>
      item({ level: level({ inGameId: n, name: n.toUpperCase() }) })
    )

    expect(sorted(rows, [{ key: 'name', dir }])).toEqual(expected)
  })

  it('sorts names case-insensitively', () => {
    const rows = [
      item({ level: level({ inGameId: 'upper', name: 'Zebra' }) }),
      item({ level: level({ inGameId: 'lower', name: 'apple' }) }),
    ]

    expect(sorted(rows, [{ key: 'name', dir: 'asc' }])).toEqual([
      'lower',
      'upper',
    ])
  })

  it('sorts ids numerically rather than as text', () => {
    const rows = ['9', '100', '20'].map((id) =>
      item({ level: level({ inGameId: id }) })
    )

    expect(sorted(rows, [{ key: 'id', dir: 'asc' }])).toEqual([
      '9',
      '20',
      '100',
    ])
  })

  it('sorts lengths in game order, not alphabetically', () => {
    const rows = ['XL', 'Tiny', 'Medium'].map((l) =>
      item({ level: level({ inGameId: l, length: l }) })
    )

    expect(sorted(rows, [{ key: 'length', dir: 'asc' }])).toEqual([
      'Tiny',
      'Medium',
      'XL',
    ])
  })

  it('sorts difficulties in game order', () => {
    const rows = ['Extreme Demon', 'Easy', 'Insane'].map((d) =>
      item({ level: level({ inGameId: d, inGameDifficulty: d }) })
    )

    expect(sorted(rows, [{ key: 'difficulty', dir: 'asc' }])).toEqual([
      'Easy',
      'Insane',
      'Extreme Demon',
    ])
  })

  it('sorts statuses completed-first', () => {
    const rows = (['DROPPED', 'COMPLETED', 'IN_PROGRESS'] as const).map((s) =>
      item({ level: level({ inGameId: s }), status: s })
    )

    expect(sorted(rows, [{ key: 'status', dir: 'asc' }])).toEqual([
      'COMPLETED',
      'IN_PROGRESS',
      'DROPPED',
    ])
  })

  it('sorts game versions numerically where it can', () => {
    const rows = ['2.11', '2.2', '1.9'].map((v) =>
      item({ level: level({ inGameId: v, gameVersion: v }) })
    )

    expect(sorted(rows, [{ key: 'gameVersion', dir: 'asc' }])).toEqual([
      '1.9',
      '2.11',
      '2.2',
    ])
  })

  it('sorts by a per-category score', () => {
    const rows = [
      item({
        level: level({ inGameId: 'low' }),
        ratingScores: [{ categoryId: 'gameplay', score: 10 }],
      }),
      item({
        level: level({ inGameId: 'high' }),
        ratingScores: [{ categoryId: 'gameplay', score: 90 }],
      }),
    ]

    expect(sorted(rows, [{ key: 'cat:gameplay', dir: 'desc' }])).toEqual([
      'high',
      'low',
    ])
  })

  // Nulls always sort last, in BOTH directions — a row with no value is not
  // "the smallest", it is "no answer", and belongs at the bottom either way.
  it.each(['asc', 'desc'] as const)(
    'sorts rows with no value last, sorting %s',
    (dir) => {
      const rows = [
        item({ level: level({ inGameId: 'none' }), overallRating: null }),
        item({ level: level({ inGameId: 'some' }), overallRating: 50 }),
      ]

      expect(sorted(rows, [{ key: 'rating', dir }])[1]).toBe('none')
    }
  )

  it('applies later sorts only to break earlier ties', () => {
    const rows = [
      item({
        level: level({ inGameId: 'b', name: 'B' }),
        status: 'COMPLETED',
      }),
      item({
        level: level({ inGameId: 'a', name: 'A' }),
        status: 'COMPLETED',
      }),
      item({
        level: level({ inGameId: 'z', name: 'Z' }),
        status: 'DROPPED',
      }),
    ]

    expect(
      sorted(rows, [
        { key: 'status', dir: 'asc' },
        { key: 'name', dir: 'asc' },
      ])
    ).toEqual(['a', 'b', 'z'])
  })

  // Weighted ties break on category score in the user's priority order before
  // any other link in the chain — the established convention for weighted
  // ratings, and now part of the canonical order rather than a Log-page-only
  // flourish, so the Ranking page and `rating_rank` observe it too.
  describe('breaking weighted-rating ties on category priority', () => {
    const tied = (id: string, gameplay: number, design: number) =>
      item({
        level: level({ inGameId: id }),
        overallRating: 80,
        ratingScores: [
          { categoryId: 'gameplay', score: gameplay },
          { categoryId: 'design', score: design },
        ],
      })

    const cats = [
      { id: 'gameplay', sortOrder: 0 },
      { id: 'design', sortOrder: 1 },
    ]

    it('falls through to the highest-priority category', () => {
      const rows = [tied('low', 10, 90), tied('high', 90, 10)]

      expect(
        sorted(rows, [{ key: 'rating', dir: 'desc' }], cats)
      ).toEqual(['high', 'low'])
    })

    it('moves to the next category when the first also ties', () => {
      const rows = [tied('low', 50, 10), tied('high', 50, 90)]

      expect(
        sorted(rows, [{ key: 'rating', dir: 'desc' }], cats)
      ).toEqual(['high', 'low'])
    })

    it('reads the categories in priority order, not declaration order', () => {
      const rows = [tied('a', 10, 90), tied('b', 90, 10)]
      const reversed = [
        { id: 'design', sortOrder: 0 },
        { id: 'gameplay', sortOrder: 1 },
      ]

      expect(
        sorted(rows, [{ key: 'rating', dir: 'desc' }], reversed)
      ).toEqual(['a', 'b'])
    })

    it('breaks ties in the sort’s own direction', () => {
      const rows = [tied('low', 10, 0), tied('high', 90, 0)]

      expect(sorted(rows, [{ key: 'rating', dir: 'asc' }], cats)).toEqual([
        'low',
        'high',
      ])
    })

    // SIMPLE mode preserves per-category scores but they carry no meaning, so
    // passing no categories must leave them out of the order entirely.
    it('ignores category scores when no categories are given', () => {
      const rows = [tied('b', 10, 90), tied('a', 90, 10)]

      // Falls all the way through to level id rather than to gameplay.
      expect(sorted(rows, [{ key: 'rating', dir: 'desc' }])).toEqual(['a', 'b'])
    })

    // The tiebreaker is scoped to the rating column; another column that
    // happens to tie is left to the next explicit sort spec.
    it('does not break ties on any other column', () => {
      const rows = [tied('first', 10, 90), tied('second', 90, 10)]

      expect(
        sorted(rows, [{ key: 'attempts', dir: 'desc' }], cats)
      ).toEqual(['first', 'second'])
    })
  })

  // The rest of the canonical chain, below the category stage. These assert
  // what a quoted rank position means, so a change here changes that.
  describe('breaking rating ties', () => {
    const tied = (
      id: string,
      over: { enjoyment?: number | null; date?: Date | null } = {}
    ) =>
      item({
        level: level({ inGameId: id }),
        overallRating: 80,
        entry: entry({
          enjoyment: over.enjoyment ?? null,
          date: over.date ?? null,
        }),
      })

    it('breaks a tied rating on enjoyment, highest first', () => {
      const rows = [
        tied('low', { enjoyment: 10 }),
        tied('high', { enjoyment: 90 }),
      ]

      expect(sorted(rows, [{ key: 'rating', dir: 'desc' }])).toEqual([
        'high',
        'low',
      ])
    })

    // A long-standing rating outranks one just added.
    it('falls through to the earlier date when enjoyment also ties', () => {
      const rows = [
        tied('new', { enjoyment: 50, date: new Date('2026-08-01') }),
        tied('old', { enjoyment: 50, date: new Date('2025-01-01') }),
      ]

      expect(sorted(rows, [{ key: 'rating', dir: 'desc' }])).toEqual([
        'old',
        'new',
      ])
    })

    // Without this last link the order is not total, and a rank position would
    // depend on the order the rows happened to arrive in.
    it('falls through to level id when everything else ties', () => {
      const rows = [tied('222'), tied('111')]

      expect(sorted(rows, [{ key: 'rating', dir: 'desc' }])).toEqual([
        '111',
        '222',
      ])
    })

    it('sorts a missing value last within its own link', () => {
      const rows = [tied('none'), tied('some', { enjoyment: 10 })]

      expect(sorted(rows, [{ key: 'rating', dir: 'desc' }])).toEqual([
        'some',
        'none',
      ])
    })

    it('reverses the whole chain when sorted ascending', () => {
      const rows = [
        tied('low', { enjoyment: 10 }),
        tied('high', { enjoyment: 90 }),
      ]

      expect(sorted(rows, [{ key: 'rating', dir: 'asc' }])).toEqual([
        'low',
        'high',
      ])
    })

    // Unrated rows are the exception to that reversal: they pin to the bottom
    // in both directions, the way every other column's nulls do.
    it('keeps unrated rows last in both directions', () => {
      const rows = [
        item({ level: level({ inGameId: 'unrated' }), overallRating: null }),
        tied('rated'),
      ]

      expect(sorted(rows, [{ key: 'rating', dir: 'desc' }])).toEqual([
        'rated',
        'unrated',
      ])
      expect(sorted(rows, [{ key: 'rating', dir: 'asc' }])).toEqual([
        'rated',
        'unrated',
      ])
    })

    // The chain is scoped to the rating column; another column that ties is
    // left to the next explicit sort spec.
    it('does not break ties on any other column', () => {
      const rows = [
        tied('first', { enjoyment: 10 }),
        tied('second', { enjoyment: 90 }),
      ]

      expect(sorted(rows, [{ key: 'attempts', dir: 'desc' }])).toEqual([
        'first',
        'second',
      ])
    })
  })
})
