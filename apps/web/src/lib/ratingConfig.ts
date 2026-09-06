// The account's rating configuration, in the shape `computeOverallRating`
// takes.
//
// Every surface that previews a rating before it is saved has to compute it
// exactly as the server will, or the number moves once the save returns. The
// inputs for that all live on `me`, so building the config is the same four
// lines everywhere — written once here rather than at each call site, where
// the copies drifted (a preview that omitted `includeEnjoyment` showed a
// different number than the screen after it).

import type { OverallRatingConfig } from '@infernolog/core'
import type { MeData } from './api/me'

/**
 * The user's {@link OverallRatingConfig}, ready to pass to
 * `computeOverallRating`.
 *
 * @param me - The signed-in account, from `useMe`.
 */
export function overallRatingConfig(me: MeData): OverallRatingConfig {
  return {
    ratingMode: me.ratingMode,
    includeEnjoyment: me.includeEnjoyment,
    enjoymentWeight: me.enjoymentWeight,
    categoryWeights: new Map(me.ratingCategories.map((c) => [c.id, c.weight])),
  }
}

/**
 * A rating-scores draft (`categoryId → score`) as `computeOverallRating`'s
 * update shape wants it.
 *
 * Entries with no score are dropped rather than sent as zero: an unscored
 * category is one the average renormalizes over, not one scored 0.
 *
 * @param scores - Draft scores on the internal 0–100 scale.
 */
export function ratingScoresFromDraft(
  scores: Record<string, number | null | undefined>
): { categoryId: string; score: number }[] {
  return Object.entries(scores).flatMap(([categoryId, score]) =>
    score == null ? [] : [{ categoryId, score }]
  )
}
