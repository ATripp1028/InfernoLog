// The GD star scale — what the game awards a rated level, and the canonical
// identifier of a non-demon level's difficulty.
//
// GD awards 1-10 stars, and the difficulty FACE is a band over that range:
//
//     1      Auto
//     2      Easy
//     3      Normal
//     4-5    Hard
//     6-7    Harder
//     8-9    Insane
//     10     Demon (every tier — Easy Demon through Extreme Demon)
//
// The mapping is therefore a SURJECTION, NOT A BIJECTION: a star count always
// determines a face, but a face does not determine a star count. A "Hard" level
// is 4 or 5 stars and nothing on the face says which. That asymmetry is why the
// star count is canonical for non-demons — it is strictly the more informative
// of the two — and why there is a {@link faceToStarRange} here and deliberately
// no `faceToStars`.
//
// Both fields are stored on `Level`. The count is canonical: comparisons,
// filters and matching key on it, and it wins wherever the two disagree (see
// deriveInGameDifficulty). The label rides along as the display copy, and is the
// only representation of the things a count cannot express — which demon tier a
// 10-star level is, and "Unrated", which has no stars at all.
//
// Related but distinct: ProgressUpdate.difficultyOpinion (see
// difficultyOpinion.ts) records the USER's own read on this same 1-9 star
// vocabulary. Same scale, different claim — the level's awarded rating versus
// what one player thinks it deserved.

/** The highest star count GD awards a non-demon level. */
export const MAX_NON_DEMON_STARS = 9

/** The star count GD awards every demon, regardless of tier. */
export const DEMON_STARS = 10

// Bands in ascending order. Hard/Harder/Insane each span two counts, which is
// what makes the face→count direction lossy.
const STAR_BANDS: readonly { face: string; min: number; max: number }[] = [
  { face: 'Auto', min: 1, max: 1 },
  { face: 'Easy', min: 2, max: 2 },
  { face: 'Normal', min: 3, max: 3 },
  { face: 'Hard', min: 4, max: 5 },
  { face: 'Harder', min: 6, max: 7 },
  { face: 'Insane', min: 8, max: 9 },
]

/**
 * Every non-demon star count with the face it denotes, easiest first. Drives
 * the non-demon difficulty pickers, so the options a user sees cannot drift
 * from what {@link starsToFace} accepts. Nine entries, not six — a picker
 * offers the star count, because that is the value actually being chosen.
 */
export const NON_DEMON_STAR_TIERS: readonly {
  stars: number
  face: string
}[] = STAR_BANDS.flatMap(({ face, min, max }) =>
  Array.from({ length: max - min + 1 }, (_, i) => ({ stars: min + i, face }))
)

/**
 * The GD difficulty face a non-demon star count denotes, or `null` when the
 * count is outside the 1–9 range a non-demon occupies (0/unrated, 10/demon).
 *
 * Total in this direction — every count in range has exactly one face.
 *
 * @param stars - Awarded star count from `Level.stars`.
 */
export function starsToFace(stars: number | null | undefined): string | null {
  if (stars == null) return null
  const band = STAR_BANDS.find((b) => stars >= b.min && stars <= b.max)
  return band?.face ?? null
}

/**
 * The inclusive star range a standard difficulty face covers, or `null` for a
 * demon tier, "Unrated", or an unrecognized label.
 *
 * A range rather than a number because the face→count direction is lossy: Hard
 * is 4–5, Harder 6–7, Insane 8–9. Use this to ask "could this label be N
 * stars?" — never to pick a single count, which a label does not determine.
 *
 * Case- and whitespace-insensitive, since spreadsheet labels are typed by hand.
 *
 * @param face - A difficulty label such as `"Harder"`.
 */
export function faceToStarRange(
  face: string | null | undefined
): { min: number; max: number } | null {
  if (face == null) return null
  const wanted = face.trim().toLowerCase()
  if (!wanted) return null
  const band = STAR_BANDS.find((b) => b.face.toLowerCase() === wanted)
  return band ? { min: band.min, max: band.max } : null
}

/**
 * Whether a difficulty label is consistent with a star count — i.e. the count
 * falls inside that label's band. False for a label naming a different face,
 * and for one this scale doesn't cover (a demon tier, "Unrated").
 *
 * The comparison to reach for when only one side has a star count: a candidate
 * carrying a label but no count can still be ruled in or out this way.
 *
 * @param face - A difficulty label such as `"Hard"`.
 * @param stars - The star count to test against it.
 */
export function faceMatchesStars(
  face: string | null | undefined,
  stars: number
): boolean {
  const range = faceToStarRange(face)
  return range != null && stars >= range.min && stars <= range.max
}

/** The level fields {@link deriveInGameDifficulty} reads. */
export interface DifficultySource {
  /** Canonical for a non-demon; 10 for any demon, 0/null when unrated. */
  stars: number | null
  /** The display copy, and the only representation of demon tiers/"Unrated". */
  inGameDifficulty: string | null
}

/**
 * The difficulty label for a level, resolving the two stored fields by
 * precedence. Every API serialization boundary runs level rows through this, so
 * one rule decides the answer everywhere.
 *
 * The star count wins for a non-demon: it is canonical, so if a stale label
 * survives a refresh that moved the count, the count is what shows. The label
 * answers for everything a count cannot express — demon tiers ("Extreme
 * Demon"), unrated levels ("Unrated") — and for a rated non-demon whose `stars`
 * never got populated, where a label beats nothing.
 *
 * A star count in 1–9 is by itself proof of a rated non-demon — demons are
 * always 10 and unrated levels 0/null — so no `isDemon` flag is needed here,
 * which is what lets the raw-SQL search and browse projections use it without
 * widening their column lists.
 */
export function deriveInGameDifficulty(level: DifficultySource): string | null {
  return starsToFace(level.stars) ?? level.inGameDifficulty
}
