// How a stored DifficultyOpinion reads to a person.
//
// Extracted from the completion review step when the Log page's field-change
// rows needed the same mapping — two copies of a value→label table is exactly
// the duplication that goes stale the next time the enum gains a member.

import { opinionToStars } from '@infernolog/core'
import { starCountToDifficulty } from '@/lib/gdAssets'

const DEMON_TIER_LABELS: Record<string, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  INSANE: 'Insane',
  EXTREME: 'Extreme',
}

/**
 * The label for one `DifficultyOpinion` value.
 *
 * The non-demon values carry their own star count (1 = AUTO … 9 = NINE_STAR)
 * and read as a disagreement with the rating rather than as a tier — the level
 * is still a rated demon. See packages/core/src/difficultyOpinion.ts.
 *
 * @returns The raw value for anything unrecognised, so a member added to the
 * enum before this table renders as itself rather than as blank.
 */
export function opinionLabel(opinion: string): string {
  const stars = opinionToStars(opinion)
  if (stars != null) {
    return `Not demon-worthy · ${stars}★ ${starCountToDifficulty(stars)}`
  }
  return DEMON_TIER_LABELS[opinion] ?? opinion
}
