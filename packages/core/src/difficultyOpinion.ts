// Shared star<->DifficultyOpinion mapping for the non-demon opinion values.
// The wire format merges "not demon-worthy" + a star count into one enum
// value (AUTO=1..NINE_STAR=9); several surfaces (completion logging, the
// edit modal, spreadsheet import/export) need to convert between the two
// representations for their UI. One source of truth here instead of each
// consumer maintaining its own copy — see docs/RATING_SYSTEM.md.
//
// Exported as plain strings rather than the DifficultyOpinion enum type:
// apps/web intentionally mirrors this enum as a local string-literal union
// per file (see apps/web/src/lib/api/logging.ts) rather than importing the
// nominal TS enum, so a plain-string export lets those local types narrow
// it with an ordinary `as` cast instead of an enum-typed mismatch.

import { DifficultyOpinion } from './enums'

const STAR_TO_OPINION_ENUM = {
  1: DifficultyOpinion.AUTO,
  2: DifficultyOpinion.TWO_STAR,
  3: DifficultyOpinion.THREE_STAR,
  4: DifficultyOpinion.FOUR_STAR,
  5: DifficultyOpinion.FIVE_STAR,
  6: DifficultyOpinion.SIX_STAR,
  7: DifficultyOpinion.SEVEN_STAR,
  8: DifficultyOpinion.EIGHT_STAR,
  9: DifficultyOpinion.NINE_STAR,
} satisfies Record<number, DifficultyOpinion>

export const STAR_TO_OPINION: Record<number, string> = STAR_TO_OPINION_ENUM

// The non-demon opinion values as plain strings (1★ Auto .. 9★), for
// consumers building a Set/allowlist without the nominal enum type.
export const NOT_DEMON_OPINION_VALUES: readonly string[] =
  Object.values(STAR_TO_OPINION_ENUM)

// Inverse of STAR_TO_OPINION. Returns null for a demon-tier opinion
// (EASY..EXTREME) or an unrecognized value.
export function opinionToStars(
  opinion: string | null | undefined
): number | null {
  if (opinion == null) return null
  for (const [stars, op] of Object.entries(STAR_TO_OPINION_ENUM)) {
    if (op === opinion) return Number(stars)
  }
  return null
}
