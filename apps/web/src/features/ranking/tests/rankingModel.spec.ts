import { describe, expect, it } from 'vitest'
import { filterPlaced, filterUnplaced, reorderDisabled } from '../filtering'
import { medalColor } from '../medals'
import { neighboursAround } from '../neighbours'
import { preScrollIndex } from '../placement'
import { level, placed, ranked, unplaced } from './fixtures'

describe('medalColor', () => {
  // Gold for your hardest, then silver and bronze; 4th–5th get a cool azure
  // so they read as the next tier rather than a fourth medal.
  it.each([1, 2, 3, 4, 5])('gives rank %s a colour', (rank) => {
    expect(medalColor(rank)).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('gives the podium three distinct colours', () => {
    const podium = [medalColor(1), medalColor(2), medalColor(3)]

    expect(new Set(podium).size).toBe(3)
  })

  it('gives 4th and 5th the same azure', () => {
    expect(medalColor(4)).toBe(medalColor(5))
  })

  it('distinguishes the azure from every medal', () => {
    expect([medalColor(1), medalColor(2), medalColor(3)]).not.toContain(
      medalColor(4)
    )
  })

  // Past 5 the row uses the default text colour, so there is nothing to say.
  it.each([6, 10, 100])('gives rank %s no colour', (rank) => {
    expect(medalColor(rank)).toBeUndefined()
  })

  it('gives a nonsensical rank no colour', () => {
    expect(medalColor(0)).toBeUndefined()
    expect(medalColor(-1)).toBeUndefined()
  })
})

describe('neighboursAround', () => {
  const ids = ['a', 'b', 'c', 'd']

  // The list is hardest-first, so "above" is harder and "below" is easier.
  it('reports both neighbours for a row in the middle', () => {
    expect(neighboursAround(ids, 2)).toEqual({ aboveId: 'b', belowId: 'd' })
  })

  // Omitting a neighbour is how the server is told "the very top" or "the
  // very bottom" — sending undefined would mean something else.
  it('omits the above neighbour at the top', () => {
    expect(neighboursAround(ids, 0)).toEqual({ belowId: 'b' })
  })

  it('omits the below neighbour at the bottom', () => {
    expect(neighboursAround(ids, 3)).toEqual({ aboveId: 'c' })
  })

  it('omits both for the only row in the list', () => {
    expect(neighboursAround(['a'], 0)).toEqual({})
  })

  it('omits both for an index off the end', () => {
    expect(neighboursAround([], 0)).toEqual({})
  })

  // The caller passes the FINAL ordering, with the moved row already at
  // `index` — so the neighbours are read straight off it.
  it('reads the neighbours out of the final ordering', () => {
    const afterMove = ['b', 'c', 'a', 'd']

    expect(neighboursAround(afterMove, 2)).toEqual({
      aboveId: 'c',
      belowId: 'd',
    })
  })
})

// The GDDL tier is a scroll hint only — it never places the level.
describe('preScrollIndex', () => {
  const withTiers = (tiers: (number | null)[]) =>
    tiers.map((t, i) =>
      placed({
        levelProgressId: `p${i}`,
        rank: i + 1,
        badge: t == null ? null : { gddlTier: t },
      })
    )

  it('scrolls to the topmost row at the same tier', () => {
    const list = withTiers([30, 25, 25, 20])

    expect(preScrollIndex(list, { gddlTier: 25 })).toBe(1)
  })

  // No exact match: land just above the first row that is easier, which is
  // where the level would slot in.
  it('scrolls to the first easier row when no tier matches', () => {
    const list = withTiers([30, 28, 20, 18])

    expect(preScrollIndex(list, { gddlTier: 25 })).toBe(2)
  })

  it('scrolls to the top when everything is easier', () => {
    const list = withTiers([20, 18, 15])

    expect(preScrollIndex(list, { gddlTier: 30 })).toBe(0)
  })

  // Nothing to slot above, so the bottom is the closest thing to right.
  it('scrolls to the bottom when everything is harder', () => {
    const list = withTiers([30, 28, 26])

    expect(preScrollIndex(list, { gddlTier: 10 })).toBe(2)
  })

  it('ignores untiered rows when looking for somewhere easier', () => {
    const list = withTiers([30, null, null, 20])

    expect(preScrollIndex(list, { gddlTier: 25 })).toBe(3)
  })

  it('lands on the bottom when every row is untiered', () => {
    const list = withTiers([null, null, null])

    expect(preScrollIndex(list, { gddlTier: 25 })).toBe(2)
  })

  // No tier opinion means no hint, so the top is as good a guess as any.
  it('scrolls to the top for a level with no tier opinion', () => {
    expect(preScrollIndex(withTiers([30, 20]), null)).toBe(0)
  })

  it('scrolls to the top of an empty ranking', () => {
    expect(preScrollIndex([], { gddlTier: 25 })).toBe(0)
    expect(preScrollIndex([], null)).toBe(0)
  })
})

describe('filterPlaced', () => {
  const rows = [
    placed({
      rank: 1,
      levelProgressId: 'a',
      level: level({ name: 'Bloodbath', creator: 'Riot', inGameId: '10' }),
    }),
    placed({
      rank: 2,
      levelProgressId: 'b',
      level: level({ name: 'Cataclysm', creator: 'Ggb0y', inGameId: '20' }),
      // Unrated levels are what the toggle hides.
    }),
    placed({
      rank: 3,
      levelProgressId: 'c',
      level: level({ name: 'Sonic Wave', creator: 'Cyclic', inGameId: '30' }),
    }),
  ]

  const ids = (list: ReturnType<typeof filterPlaced>) =>
    list.map((e) => e.levelProgressId)

  it('returns everything with no search and unrated shown', () => {
    expect(ids(filterPlaced(rows, '', true))).toEqual(['a', 'b', 'c'])
  })

  describe('search', () => {
    it.each([
      ['a name', 'blood', ['a']],
      ['a creator', 'ggb', ['b']],
      ['an in-game id', '30', ['c']],
    ])('matches on %s', (_label, q, expected) => {
      expect(ids(filterPlaced(rows, q, true))).toEqual(expected)
    })

    it('ignores case and surrounding whitespace', () => {
      expect(ids(filterPlaced(rows, '  BLOODBATH  ', true))).toEqual(['a'])
    })

    it('returns nothing when nothing matches', () => {
      expect(filterPlaced(rows, 'zzzz', true)).toEqual([])
    })

    // Search hides non-matches but leaves the view's numbering alone — the
    // ranks a user sees should not shuffle just because they typed.
    it('keeps the surviving rows’ rank numbers', () => {
      const result = filterPlaced(rows, 'sonic', true)

      expect(result[0]!.rank).toBe(3)
    })
  })

  describe('the show-unrated toggle', () => {
    const mixed = [
      placed({ rank: 1, levelProgressId: 'a' }),
      placed({
        rank: 2,
        levelProgressId: 'unrated',
        level: level({ isRated: false }),
      }),
      placed({ rank: 3, levelProgressId: 'c' }),
    ]

    it('hides in-game-unrated levels when off', () => {
      expect(ids(filterPlaced(mixed, '', false))).toEqual(['a', 'c'])
    })

    // "Ranking numbers update for that view" — the remaining rows renumber
    // contiguously so the list does not read 1, 3, 4.
    it('renumbers the survivors contiguously', () => {
      const result = filterPlaced(mixed, '', false)

      expect(result.map((e) => e.rank)).toEqual([1, 2])
    })

    it('leaves the ranks alone when nothing was hidden', () => {
      const result = filterPlaced(
        [placed({ rank: 1, levelProgressId: 'a' })],
        '',
        false
      )

      expect(result[0]!.rank).toBe(1)
    })

    // Renumbering must not mutate the query data the board reorders against.
    it('leaves the input rows untouched', () => {
      const originalRanks = mixed.map((e) => e.rank)

      filterPlaced(mixed, '', false)

      expect(mixed.map((e) => e.rank)).toEqual(originalRanks)
    })

    it('renumbers before searching, so a search sees the view numbers', () => {
      const result = filterPlaced(mixed, 'level', false)

      expect(result.map((e) => e.rank)).toEqual([1, 2])
    })
  })
})

describe('filterUnplaced', () => {
  const cards = [
    unplaced({
      levelProgressId: 'a',
      level: level({ name: 'Bloodbath', creator: 'Riot', inGameId: '10' }),
    }),
    unplaced({
      levelProgressId: 'b',
      level: level({ name: 'Cataclysm', creator: 'Ggb0y', inGameId: '20' }),
    }),
  ]

  it('returns everything with no search', () => {
    expect(filterUnplaced(cards, '')).toEqual(cards)
  })

  it('returns everything for a whitespace-only search', () => {
    expect(filterUnplaced(cards, '   ')).toEqual(cards)
  })

  it.each([
    ['a name', 'blood', ['a']],
    ['a creator', 'ggb', ['b']],
    ['an in-game id', '20', ['b']],
  ])('matches on %s', (_label, q, expected) => {
    expect(filterUnplaced(cards, q).map((e) => e.levelProgressId)).toEqual(
      expected
    )
  })

  it('leaves the input untouched', () => {
    const before = [...cards]

    filterUnplaced(cards, 'blood')

    expect(cards).toEqual(before)
  })
})

// Dragging is disabled whenever rows are actually hidden, because a row's
// position relative to what it cannot see is ambiguous.
describe('reorderDisabled', () => {
  it('allows dragging when nothing is filtered', () => {
    expect(reorderDisabled(10, 10, '')).toBe(false)
  })

  it('blocks dragging while a search is active', () => {
    expect(reorderDisabled(10, 10, 'blood')).toBe(true)
  })

  it('ignores a whitespace-only search', () => {
    expect(reorderDisabled(10, 10, '   ')).toBe(false)
  })

  it('blocks dragging when the toggle hid some rows', () => {
    expect(reorderDisabled(10, 8, '')).toBe(true)
  })

  // "Show unrated" off with no unrated levels present hides nothing, so
  // dragging stays enabled by default rather than being off for everyone.
  it('allows dragging when the toggle hid nothing', () => {
    expect(reorderDisabled(10, 10, '')).toBe(false)
  })

  it('blocks dragging when both are active', () => {
    expect(reorderDisabled(10, 4, 'blood')).toBe(true)
  })

  it('allows dragging on an empty ranking', () => {
    expect(reorderDisabled(0, 0, '')).toBe(false)
  })

  // The two work together on real data: the counts come from filterPlaced.
  it('agrees with what filterPlaced actually hid', () => {
    const rows = [
      ...ranked(['a', 'b']),
      placed({ levelProgressId: 'unrated', level: level({ isRated: false }) }),
    ]
    const view = filterPlaced(rows, '', false)

    expect(reorderDisabled(rows.length, view.length, '')).toBe(true)
  })
})
