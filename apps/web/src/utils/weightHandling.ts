import type { RatingCategory } from '@/lib/api/me'

/**
 * The weighted average of the category scores the user has actually filled in.
 *
 * Renormalizes over the categories present rather than treating a missing
 * score as zero, so a half-filled form shows a meaningful running average.
 *
 * @returns `null` when no scored category has any weight — there is nothing
 * to average, which is different from an average of 0.
 */
export function computeWeightedAvg(
  categories: RatingCategory[],
  scores: Record<string, number>
): number | null {
  let weightSum = 0
  let weighted = 0
  for (const cat of categories) {
    const score = scores[cat.id]
    if (score == null) continue
    weightSum += cat.weight
    weighted += score * cat.weight
  }
  if (weightSum === 0) return null
  return weighted / weightSum
}
