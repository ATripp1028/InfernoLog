import { describe, expect, it } from 'vitest'
import { computeOverallRating } from '@infernolog/core'
import { overallRatingConfig, ratingScoresFromDraft } from '../ratingConfig'
import { makeMe } from '@/utils/testUtils'

const CATEGORIES = [
  { id: 'gameplay', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
  { id: 'decoration', name: 'Decoration', weight: 0.5, sortOrder: 1 },
]

describe('overallRatingConfig', () => {
  it('carries the account settings the computation reads', () => {
    const config = overallRatingConfig(
      makeMe({
        ratingMode: 'WEIGHTED',
        includeEnjoyment: true,
        enjoymentWeight: 2,
        ratingCategories: CATEGORIES,
      })
    )

    expect(config).toMatchObject({
      ratingMode: 'WEIGHTED',
      includeEnjoyment: true,
      enjoymentWeight: 2,
    })
    expect(config.categoryWeights.get('gameplay')).toBe(0.5)
  })

  // The whole point of the helper: a preview built from it computes what the
  // server computes, enjoyment opt-in included.
  it('drives the same number the server would', () => {
    const me = makeMe({
      ratingMode: 'WEIGHTED',
      includeEnjoyment: true,
      enjoymentWeight: 1,
      ratingCategories: CATEGORIES,
    })

    const rating = computeOverallRating(overallRatingConfig(me), {
      simpleRating: null,
      enjoyment: 25,
      ratingScores: ratingScoresFromDraft({ gameplay: 80, decoration: 60 }),
    })

    // (80×0.5 + 60×0.5 + 25×1) / (0.5 + 0.5 + 1)
    expect(rating).toBe(47.5)
  })
})

describe('ratingScoresFromDraft', () => {
  it('drops unscored categories rather than sending them as zero', () => {
    // An unscored category is one the average renormalizes over — scoring it
    // 0 would drag the running number down to a value nothing will store.
    expect(
      ratingScoresFromDraft({
        gameplay: 80,
        decoration: null,
        pacing: undefined,
      })
    ).toEqual([{ categoryId: 'gameplay', score: 80 }])
  })

  it('keeps a genuine zero', () => {
    expect(ratingScoresFromDraft({ gameplay: 0 })).toEqual([
      { categoryId: 'gameplay', score: 0 },
    ])
  })
})
