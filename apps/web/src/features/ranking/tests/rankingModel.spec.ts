import { describe, expect, it } from 'vitest'
import { LevelProgressStatus } from '@infernolog/core'
import {
  buildManualRanking,
  buildRanking,
  filterByDifficulty,
  filterByRatedStatus,
  filterRanking,
  renumberInView,
  sortRanking,
  toggleDifficulty,
  NON_DEMON,
  OVERALL_SORT,
} from '../rankingModel'
import { makeLevel, makeListItem } from '@/utils/testUtils'

const rated = (
  id: string,
  rating: number | null,
  status: LevelProgressStatus = LevelProgressStatus.COMPLETED
) =>
  makeListItem({
    level: makeLevel({ inGameId: id }),
    status,
    overallRating: rating,
  })

const ids = (entries: { item: { level: { inGameId: string } } }[]) =>
  entries.map((e) => e.item.level.inGameId)

describe('buildRanking', () => {
  it('numbers rated completions from 1, best first', () => {
    const { entries } = buildRanking([
      rated('a', 40),
      rated('b', 90),
      rated('c', 70),
    ])

    expect(ids(entries)).toEqual(['b', 'c', 'a'])
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3])
  })

  // A rating on an unfinished level is a legitimate thing to have logged, but
  // a ranking of levels you have not beaten is a different list.
  it('takes only completions, whatever their rating', () => {
    const { entries } = buildRanking([
      rated('done', 50),
      rated('wip', 99, LevelProgressStatus.IN_PROGRESS),
      rated('gone', 99, LevelProgressStatus.DROPPED),
    ])

    expect(ids(entries)).toEqual(['done'])
  })

  // An unranked level — one with no rating of the user's own — holds no
  // position, the same rule the server applies when it records rating_rank.
  it('drops unranked completions and counts them instead', () => {
    const model = buildRanking([
      rated('a', 90),
      rated('none', null),
      rated('b', 50),
    ])

    expect(ids(model.entries)).toEqual(['a', 'b'])
    expect(model.entries.map((e) => e.rank)).toEqual([1, 2])
    expect(model.unrankedCount).toBe(1)
  })

  it('counts nothing unranked when every completion is rated', () => {
    expect(buildRanking([rated('a', 90)]).unrankedCount).toBe(0)
  })

  // The tie-break chain itself is core's; this only checks the page hands it
  // the categories, so a weighted tie resolves here the way it does elsewhere.
  it('breaks a tie on category priority when categories are given', () => {
    const tied = (id: string, gameplay: number) =>
      makeListItem({
        level: makeLevel({ inGameId: id }),
        overallRating: 80,
        ratingScores: [{ categoryId: 'gameplay', score: gameplay }],
      })

    const { entries } = buildRanking(
      [tied('low', 10), tied('high', 90)],
      [{ id: 'gameplay', sortOrder: 0 }]
    )

    expect(ids(entries)).toEqual(['high', 'low'])
  })
})

describe('filterRanking', () => {
  const { entries } = buildRanking([
    makeListItem({
      level: makeLevel({ inGameId: '111', name: 'Tartarus' }),
      overallRating: 90,
    }),
    makeListItem({
      level: makeLevel({ inGameId: '222', name: 'Bloodbath' }),
      overallRating: 50,
    }),
  ])

  it('matches on name, case-insensitively', () => {
    expect(ids(filterRanking(entries, 'blood'))).toEqual(['222'])
  })

  it('matches on level id', () => {
    expect(ids(filterRanking(entries, '111'))).toEqual(['111'])
  })

  it('returns everything for a blank query', () => {
    expect(ids(filterRanking(entries, '   '))).toEqual(['111', '222'])
  })

  // Positions are assigned over the whole ranking, so a search shows each
  // level's real place rather than renumbering 1..n over the matches.
  it('keeps each row’s real position when filtered', () => {
    expect(filterRanking(entries, 'blood')[0]?.rank).toBe(2)
  })
})

describe('sortRanking', () => {
  // rank 1..4 by overall; the category scores deliberately disagree with it.
  const scored = (id: string, overall: number, gameplay: number | null) =>
    makeListItem({
      level: makeLevel({ inGameId: id }),
      overallRating: overall,
      ratingScores:
        gameplay == null ? [] : [{ categoryId: 'gameplay', score: gameplay }],
    })

  const { entries } = buildRanking([
    scored('a', 90, 40),
    scored('b', 80, 90),
    scored('c', 70, 60),
    scored('d', 60, null),
  ])

  const order = (sort: Parameters<typeof sortRanking>[1]) =>
    sortRanking(entries, sort).map((e) => e.item.level.inGameId)

  const ranks = (sort: Parameters<typeof sortRanking>[1]) =>
    sortRanking(entries, sort).map((e) => e.rank)

  it('sorts by the ranking itself by default', () => {
    expect(order({ key: OVERALL_SORT, dir: 'desc' })).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('sorts by a category, against the ranking order', () => {
    expect(order({ key: 'gameplay', dir: 'desc' })).toEqual([
      'b',
      'c',
      'a',
      'd',
    ])
  })

  // The whole point: a row keeps its position in the RANKING while the view is
  // ordered by something else.
  it('does not renumber the rows it reorders', () => {
    expect(ranks({ key: 'gameplay', dir: 'desc' })).toEqual([2, 3, 1, 4])
  })

  it('reverses on an ascending sort', () => {
    expect(order({ key: 'gameplay', dir: 'asc' })).toEqual(['a', 'c', 'b', 'd'])
  })

  // A blank is not a worst score, so it stays at the bottom either way.
  it('keeps an unscored category last in both directions', () => {
    const last = (sort: Parameters<typeof sortRanking>[1]) => {
      const ids = order(sort)
      return ids[ids.length - 1]
    }

    expect(last({ key: 'gameplay', dir: 'desc' })).toBe('d')
    expect(last({ key: 'gameplay', dir: 'asc' })).toBe('d')
  })

  it('breaks a category tie on overall standing', () => {
    const tied = buildRanking([
      scored('better', 90, 50),
      scored('worse', 40, 50),
    ])

    expect(
      sortRanking(tied.entries, { key: 'gameplay', dir: 'desc' }).map(
        (e) => e.item.level.inGameId
      )
    ).toEqual(['better', 'worse'])
  })

  it('leaves the input array untouched', () => {
    const before = [...entries]

    sortRanking(entries, { key: 'gameplay', dir: 'desc' })

    expect(entries).toEqual(before)
  })
})

describe('filterByDifficulty', () => {
  const level = (id: string, difficulty: string, isDemon: boolean) =>
    makeListItem({
      level: makeLevel({ inGameId: id, inGameDifficulty: difficulty, isDemon }),
      overallRating: 80,
    })

  const { entries } = buildRanking([
    level('x', 'Extreme Demon', true),
    level('e', 'Easy Demon', true),
    level('h', 'Harder', false),
    level('a', 'Auto', false),
  ])

  const ids = (selected: string[]) =>
    filterByDifficulty(entries, selected)
      .map((e) => e.item.level.inGameId)
      .sort()

  it('shows everything when nothing is selected', () => {
    expect(ids([])).toEqual(['a', 'e', 'h', 'x'])
  })

  it('narrows to one difficulty', () => {
    expect(ids(['Easy Demon'])).toEqual(['e'])
  })

  it('takes several difficulties at once', () => {
    expect(ids(['Easy Demon', 'Extreme Demon'])).toEqual(['e', 'x'])
  })

  // Keyed off the level's own isDemon flag, so it stays right for a level whose
  // difficulty string is missing or unexpected.
  it('takes every non-demon under the aggregate', () => {
    expect(ids([NON_DEMON])).toEqual(['a', 'h'])
  })

  it('leaves positions alone', () => {
    expect(filterByDifficulty(entries, ['Easy Demon'])[0]?.rank).toBe(2)
  })
})

describe('toggleDifficulty', () => {
  it('adds and removes a difficulty', () => {
    expect(toggleDifficulty([], 'Easy Demon')).toEqual(['Easy Demon'])
    expect(toggleDifficulty(['Easy Demon'], 'Easy Demon')).toEqual([])
  })

  it('accumulates several', () => {
    expect(toggleDifficulty(['Easy Demon'], 'Hard Demon')).toEqual([
      'Easy Demon',
      'Hard Demon',
    ])
  })

  // The two readings cannot both hold: "only non-demons" and "only Easy Demons"
  // would leave nothing, so picking either clears the other.
  it('replaces the whole selection with the non-demon aggregate', () => {
    expect(toggleDifficulty(['Easy Demon', 'Hard Demon'], NON_DEMON)).toEqual([
      NON_DEMON,
    ])
  })

  it('drops the non-demon aggregate when a demon is picked', () => {
    expect(toggleDifficulty([NON_DEMON], 'Easy Demon')).toEqual(['Easy Demon'])
  })

  it('turns the aggregate off back to All', () => {
    expect(toggleDifficulty([NON_DEMON], NON_DEMON)).toEqual([])
  })
})

describe('filterByRatedStatus', () => {
  const level = (id: string, isRated: boolean) =>
    makeListItem({
      level: makeLevel({ inGameId: id, isRated }),
      overallRating: 80,
    })

  const { entries } = buildRanking([level('rated', true), level('un', false)])

  it('shows everything when unrated levels are allowed', () => {
    expect(
      filterByRatedStatus(entries, true).map((e) => e.item.level.inGameId)
    ).toEqual(['rated', 'un'])
  })

  // The in-game sense: no stars from RobTop. A level the USER has not rated is
  // unranked and never reaches this list at all.
  it('drops in-game-unrated levels when they are hidden', () => {
    expect(
      filterByRatedStatus(entries, false).map((e) => e.item.level.inGameId)
    ).toEqual(['rated'])
  })

  it('leaves positions alone', () => {
    expect(filterByRatedStatus(entries, false)[0]?.rank).toBe(1)
  })
})

describe('renumberInView', () => {
  const { entries } = buildRanking([
    makeListItem({ level: makeLevel({ inGameId: 'a' }), overallRating: 90 }),
    makeListItem({ level: makeLevel({ inGameId: 'b' }), overallRating: 80 }),
    makeListItem({ level: makeLevel({ inGameId: 'c' }), overallRating: 70 }),
  ])

  it('counts the rows it is given, in the order it is given them', () => {
    const view = [entries[1]!, entries[2]!]

    expect(renumberInView(view).map((e) => e.rank)).toEqual([1, 2])
  })

  it('leaves the rows themselves untouched', () => {
    const view = [entries[1]!]

    expect(renumberInView(view)[0]?.item).toBe(entries[1]!.item)
    // …and does not mutate the originals.
    expect(entries[1]!.rank).toBe(2)
  })
})

describe('buildManualRanking', () => {
  const completion = (id: string) =>
    makeListItem({
      levelProgressId: `lp-${id}`,
      level: makeLevel({ inGameId: id }),
      // MANUAL has no numbers at all; the order carries the meaning.
      overallRating: null,
    })

  const items = [completion('a'), completion('b'), completion('c')]

  it('takes its order from the server, not from any rating', () => {
    const { entries } = buildManualRanking(items, ['lp-c', 'lp-a', 'lp-b'])

    expect(entries.map((e) => e.item.level.inGameId)).toEqual(['c', 'a', 'b'])
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3])
  })

  it('counts completions the user has not placed as unranked', () => {
    const model = buildManualRanking(items, ['lp-a'])

    expect(model.entries).toHaveLength(1)
    expect(model.unrankedCount).toBe(2)
  })

  // A placed level the progress list has not caught up with is cache skew, not
  // a ranking error — better a short list than a hole in it.
  it('skips a placed level the progress list does not have', () => {
    const { entries } = buildManualRanking(items, ['lp-a', 'lp-missing'])

    expect(entries.map((e) => e.item.level.inGameId)).toEqual(['a'])
    expect(entries.map((e) => e.rank)).toEqual([1])
  })

  it('ignores non-completions when counting unranked', () => {
    const inProgress = makeListItem({
      levelProgressId: 'lp-wip',
      status: LevelProgressStatus.IN_PROGRESS,
    })

    expect(buildManualRanking([...items, inProgress], []).unrankedCount).toBe(3)
  })
})
