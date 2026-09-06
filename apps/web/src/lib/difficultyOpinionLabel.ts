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

/**
 * The in-game difficulty a `DifficultyOpinion` asserts, as the label the
 * difficulty-face assets are keyed on — `"Easy Demon"` for the demon tiers,
 * the star count's standard face (`"Insane"`) for the non-demon values.
 *
 * The answer's OWN difficulty, not the level's rated one: the whole point of
 * the field is that the two can disagree.
 *
 * @returns `null` for anything unrecognised, so a caller renders no face
 * rather than the NA face as though it were an answer.
 */
export function opinionDifficulty(opinion: string): string | null {
  const stars = opinionToStars(opinion)
  if (stars != null) return starCountToDifficulty(stars)
  const tier = DEMON_TIER_LABELS[opinion]
  return tier ? `${tier} Demon` : null
}

/**
 * The compact label for one opinion, for surfaces that show its difficulty
 * face alongside. The face already reads as non-demon, so the star values
 * shrink to `"9★ Insane"` instead of spelling out "Not demon-worthy" the
 * way {@link opinionLabel} does.
 *
 * @returns The raw value for anything unrecognised, matching {@link opinionLabel}.
 */
export function opinionShortLabel(opinion: string): string {
  const stars = opinionToStars(opinion)
  if (stars != null) return `${stars}★ ${starCountToDifficulty(stars)}`
  return DEMON_TIER_LABELS[opinion] ?? opinion
}
