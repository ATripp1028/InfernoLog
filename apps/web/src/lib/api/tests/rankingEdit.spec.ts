import { describe, expect, it } from 'vitest'
import type { OverallRatingConfig } from '@infernolog/core'
import { applyEdit } from '../ranking'
import { makeListItem } from '@/utils/testUtils'

const SIMPLE: OverallRatingConfig = {
  ratingMode: 'SIMPLE',
  includeEnjoyment: false,
  enjoymentWeight: 0,
  categoryWeights: new Map(),
}

const WEIGHTED: OverallRatingConfig = {
  ratingMode: 'WEIGHTED',
  includeEnjoyment: false,
  enjoymentWeight: 0,
  categoryWeights: new Map([
    ['gameplay', 0.5],
    ['design', 0.5],
  ]),
}

describe('applyEdit', () => {
  it('takes the new simple rating as the overall rating', () => {
    const row = makeListItem({ overallRating: 40 })

    const next = applyEdit(
      row,
      { levelId: row.level.inGameId, simpleRating: 90 },
      SIMPLE
    )

    expect(next.overallRating).toBe(90)
  })

  it('recomputes the weighted average from the new scores', () => {
    const row = makeListItem({
      overallRating: 50,
      ratingScores: [
        { categoryId: 'gameplay', score: 50 },
        { categoryId: 'design', score: 50 },
      ],
    })

    const next = applyEdit(
      row,
      {
        levelId: row.level.inGameId,
        ratingScores: [
          { categoryId: 'gameplay', score: 90 },
          { categoryId: 'design', score: 70 },
        ],
      },
      WEIGHTED
    )

    expect(next.overallRating).toBe(80)
    expect(next.ratingScores).toEqual([
      { categoryId: 'gameplay', score: 90 },
      { categoryId: 'design', score: 70 },
    ])
  })

  // Enjoyment is not editable from this row, but it feeds the average when the
  // user has opted in — so the optimistic value has to keep reading it off the
  // row rather than dropping it.
  it('keeps the row’s enjoyment in the average when it counts', () => {
    const row = makeListItem({
      ratingScores: [{ categoryId: 'gameplay', score: 60 }],
      entry: { ...makeListItem({}).entry!, enjoyment: 100 },
    })

    const next = applyEdit(
      row,
      {
        levelId: row.level.inGameId,
        ratingScores: [{ categoryId: 'gameplay', score: 60 }],
      },
      {
        ...WEIGHTED,
        includeEnjoyment: true,
        enjoymentWeight: 0.5,
        categoryWeights: new Map([['gameplay', 0.5]]),
      }
    )

    expect(next.overallRating).toBe(80)
  })

  it('leaves other rows’ shape untouched', () => {
    const row = makeListItem({ overallRating: 40 })

    const next = applyEdit(
      row,
      { levelId: row.level.inGameId, simpleRating: 90 },
      SIMPLE
    )

    expect(next.level).toBe(row.level)
    expect(next.levelProgressId).toBe(row.levelProgressId)
  })
})
