// How a level's in-game difficulty is written into a spreadsheet cell — the
// write side of the convention that import/levelResolution.ts parses.
//
// The format inherited one ambiguity from the days when everything logged here
// was a demon: a bare tier name in `in_game_difficulty` means the DEMON tier,
// so "Hard" is Hard Demon and not the 4-5 star Hard. That convention is what
// the template documents and it stays. It does mean an export cannot write a
// non-demon's face label straight into the cell — the sheet it produces
// re-imports as a demon, and the difficulty filter then rules the row's own
// level out of its candidate list (see difficultyPredicate).
//
// So a non-demon gets one of two unambiguous spellings:
//
//   "5★"                 — the canonical star count (packages/core's
//                          starDifficulty.ts), which pins the difficulty
//                          exactly. Only 1-9 can be written this way; 10 is
//                          every demon tier at once.
//   "Insane (non-demon)" — the face alone, marked. Says only which band, which
//                          is all the row knows when the count is missing (a
//                          cache row that only ever carried a label) or off the
//                          non-demon scale (an official level's bespoke 10-15
//                          star award).
//
// Demon tiers and "Unrated" are written as-is: neither is ambiguous.

import {
  MAX_NON_DEMON_STARS,
  faceMatchesStars,
  faceToStarRange,
} from '@infernolog/core'
import {
  resolveLevelDifficulty,
  type LevelDifficultyFields,
} from '../levels/difficulty'

/** Appended to a face whose star count can't be written, per this module's header. */
export const NON_DEMON_SUFFIX = ' (non-demon)'

/**
 * The `in_game_difficulty` cell for a level: its resolved difficulty, spelled
 * so that re-importing the sheet resolves back to this same level.
 *
 * Every export tab that carries the column must go through this rather than
 * writing a difficulty label directly, or its non-demon rows come back as
 * demon-tier claims. See this module's header for the two spellings.
 *
 * @param level - Level row carrying its id, star count and stored label.
 * @returns The cell text, or null when the level has no known difficulty.
 */
export function toSheetDifficulty(level: LevelDifficultyFields): string | null {
  const label = resolveLevelDifficulty(level)
  if (label == null) return null

  // Demon tier or "Unrated" — nothing this scale covers, so nothing to spell.
  if (faceToStarRange(label) == null) return label

  // A count only speaks for the face when the two agree. They always do for a
  // rated user level (the label is derived from the count), and often don't for
  // an official one, whose label is the authority — write the marked face there.
  const { stars } = level
  const writableCount =
    stars != null &&
    stars >= 1 &&
    stars <= MAX_NON_DEMON_STARS &&
    faceMatchesStars(label, stars)

  return writableCount ? `${stars}★` : `${label}${NON_DEMON_SUFFIX}`
}
