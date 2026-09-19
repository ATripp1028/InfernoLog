// How a stored DifficultyOpinion reads to a person.
//
// Extracted from the completion review step when the Log page's field-change
// rows needed the same mapping — two copies of a value→label table is exactly
// the duplication that goes stale the next time the enum gains a member.

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
 * `NOT_DEMON_WORTHY` reads as a disagreement with the rating rather than as a
 * tier — the level is still a rated demon.
 *
 * @returns The raw value for anything unrecognised, so a member added to the
 * enum before this table renders as itself rather than as blank.
 */
export function opinionLabel(opinion: string): string {
  if (opinion === 'NOT_DEMON_WORTHY') return 'Not demon-worthy'
  return DEMON_TIER_LABELS[opinion] ?? opinion
}

/**
 * The in-game difficulty a `DifficultyOpinion` asserts, as the label the
 * difficulty-face assets are keyed on — `"Easy Demon"` for the demon tiers.
 *
 * The answer's OWN difficulty, not the level's rated one: the whole point of
 * the field is that the two can disagree.
 *
 * @returns `null` for `NOT_DEMON_WORTHY`, which asserts no difficulty of its
 * own, and for anything unrecognised — so a caller renders no face rather than
 * the NA face as though it were an answer.
 */
export function opinionDifficulty(opinion: string): string | null {
  const tier = DEMON_TIER_LABELS[opinion]
  return tier ? `${tier} Demon` : null
}

/**
 * The compact label for one opinion, for surfaces that show its difficulty
 * face alongside.
 *
 * @returns The raw value for anything unrecognised, matching {@link opinionLabel}.
 */
export function opinionShortLabel(opinion: string): string {
  if (opinion === 'NOT_DEMON_WORTHY') return 'Not demon-worthy'
  return DEMON_TIER_LABELS[opinion] ?? opinion
}
