// Resolving a level's difficulty label — core's star-precedence rule, plus the
// one exemption that rule does not survive contact with.
//
// packages/core's deriveInGameDifficulty treats `stars` as canonical for a
// non-demon, because for a USER-CREATED level GD awards stars strictly by
// difficulty band (Hard is 4-5, Harder 6-7, Insane 8-9).
//
// RobTop's own main levels do not play by that rule. Their star awards are
// bespoke and run 1-15, assigned per level rather than per band, so the count
// says nothing reliable about the face: Stereo Madness is 1 star but Easy (not
// Auto), Time Machine is 8 stars but Harder (not Insane), Deadlocked is 15.
// Eleven of the 38 seeded official levels contradict the banding outright.
//
// For those rows the stored label is the authority and the star count is just a
// number to display. Everything in `data/officialLevels.ts` is exempt; nothing
// else is, since every other level in the cache came from RobTop's rating
// system and does follow the bands.

import { deriveInGameDifficulty } from '@infernolog/core'
import { OFFICIAL_LEVELS_BY_ID } from '../../data/officialLevels'

/** The fields {@link resolveLevelDifficulty} reads. */
export interface LevelDifficultyFields {
  inGameId: string
  stars: number | null
  inGameDifficulty: string | null
}

/**
 * The difficulty label to serialize for a level.
 *
 * Applies core's rule — the star count is canonical for a non-demon and wins
 * over a stale label — EXCEPT for official levels, whose bespoke star awards
 * don't follow GD's difficulty bands and whose stored label is therefore the
 * only trustworthy source. See this module's header.
 *
 * Every API path that returns a level difficulty must go through this rather
 * than calling `deriveInGameDifficulty` directly, or official levels serialize
 * with a difficulty they don't have.
 *
 * @param level - Level row carrying its id, star count and stored label.
 */
export function resolveLevelDifficulty(
  level: LevelDifficultyFields
): string | null {
  if (OFFICIAL_LEVELS_BY_ID.has(level.inGameId)) return level.inGameDifficulty
  return deriveInGameDifficulty(level)
}
