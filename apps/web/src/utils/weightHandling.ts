import type { RatingCategory } from '@/lib/api/me'

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
