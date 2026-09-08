// Overall-rating computation for a single progress update. Shared by
// apps/api (query-time serialization) and apps/web (client-side preview
// before an edit is saved) so the two never drift — see docs/RATING_SYSTEM.md.
//
// The displayed/filtered rating is computed at query time and never stored. It
// is the weighted average of the user's per-category scores:
//
//   weighted_avg = Σ(score_i × weight_i) / Σ(weight_i)
//
// Enjoyment is excluded by default and only folded in (with `enjoymentWeight`)
// when the user has opted in via `includeEnjoyment`. The division normalizes
// automatically, so terms whose category has no score on this update are simply
// omitted rather than counted as zero. All values are on the 0–100 internal
// scale, enjoyment included — so an enjoyment shown as 85 and a category score
// shown as 8.5 weigh the same here. The UI converts on the way out: scores are
// shown on 0–10, enjoyment on 0–100 (see apps/web/src/lib/ratingScale.ts).

/**
 * The user's rating configuration, as the overall-rating formula needs it.
 */
export interface OverallRatingConfig {
  includeEnjoyment: boolean
  enjoymentWeight: number
  // categoryId → weight, for the user's current rating categories.
  categoryWeights: Map<string, number>
}

interface RatingUpdate {
  enjoyment: number | null
  ratingScores: { categoryId: string; score: number }[]
}

/**
 * The weighted average of an update's per-category scores, on the internal
 * 0–100 scale, or null when nothing scored contributes any weight.
 */
export function computeOverallRating(
  config: OverallRatingConfig,
  update: RatingUpdate
): number | null {
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
