// Overall-rating computation for a single progress update. Shared by
// apps/api (query-time serialization) and apps/web (client-side preview
// before an edit is saved) so the two never drift — see docs/RATING_SYSTEM.md.
//
// The displayed/filtered rating is computed at query time and never stored.
// In SIMPLE mode it is just `simpleRating`; in WEIGHTED mode it is the
// weighted average of the user's per-category scores:
//
//   weighted_avg = Σ(score_i × weight_i) / Σ(weight_i)
//
// Enjoyment is excluded by default and only folded in (with `enjoymentWeight`)
// when the user has opted in via `includeEnjoyment`. The division normalizes
// automatically, so terms whose category has no score on this update are simply
// omitted rather than counted as zero. All values are on the 0–100 internal
// scale; display conversion happens in the UI per `user.ratingDisplayScale`.

// `ratingMode` is a plain string union rather than a nominal enum so the
// helper accepts values from either app's enum without a type mismatch.
export interface OverallRatingConfig {
  ratingMode: 'SIMPLE' | 'WEIGHTED' | 'MANUAL'
  includeEnjoyment: boolean
  enjoymentWeight: number
  // categoryId → weight, for the user's current rating categories.
  categoryWeights: Map<string, number>
}

interface RatingUpdate {
  simpleRating: number | null
  enjoyment: number | null
  ratingScores: { categoryId: string; score: number }[]
}

export function computeOverallRating(
  config: OverallRatingConfig,
  update: RatingUpdate
): number | null {
  // MANUAL mode has no number at all: the user's chosen POSITION is the rating,
  // and it lives in rating_ranking.ratingIndex rather than on the update. Null
  // rather than 0 — the level is not rated badly, it is rated by where it sits.
  if (config.ratingMode === 'MANUAL') return null
  if (config.ratingMode === 'SIMPLE') {
    return update.simpleRating
  }

  let weightedSum = 0
  let weightTotal = 0

  for (const { categoryId, score } of update.ratingScores) {
    const weight = config.categoryWeights.get(categoryId)
    // Skip scores whose category is no longer part of the user's config.
    if (weight === undefined) continue
    weightedSum += score * weight
    weightTotal += weight
  }

  if (config.includeEnjoyment && update.enjoyment !== null) {
    weightedSum += update.enjoyment * config.enjoymentWeight
    weightTotal += config.enjoymentWeight
  }

  if (weightTotal === 0) return null
  // Round to 3 decimal places rather than to a whole number — the display
  // layer strips trailing zeros, so extra precision only shows up when it's
  // meaningful (e.g. narrowly-tied levels).
  return Math.round((weightedSum / weightTotal) * 1000) / 1000
}
