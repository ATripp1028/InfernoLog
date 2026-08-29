import { describe, expect, it } from 'vitest'
import { LevelProgressStatus } from '@infernolog/core'
import { buildRanking, filterRanking } from '../rankingModel'
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

  // An unrated level holds no position — the same rule the server applies when
  // it records rating_rank.
  it('drops unrated completions and counts them instead', () => {
    const model = buildRanking([
      rated('a', 90),
      rated('none', null),
      rated('b', 50),
    ])

    expect(ids(model.entries)).toEqual(['a', 'b'])
    expect(model.entries.map((e) => e.rank)).toEqual([1, 2])
    expect(model.unratedCount).toBe(1)
  })

  it('counts no unrated completions when every one is rated', () => {
    expect(buildRanking([rated('a', 90)]).unratedCount).toBe(0)
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
