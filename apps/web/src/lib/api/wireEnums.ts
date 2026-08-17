// The domain enums as they travel over the wire, mirrored from
// packages/core's Prisma-backed enums as plain string-literal unions.
//
// Two reasons this file exists rather than importing core's enums directly:
// core pins zod@3 while the server validates on zod@4, and
// core's nominal TS `enum` types do not narrow from the plain strings that
// `JSON.parse` hands back — a string-literal union does, with an ordinary
// `as` cast. packages/core/src/difficultyOpinion.ts documents the same
// decision from the other side.
//
// These were previously re-declared in each of lib/api/{me,logging,import}.ts
// — three copies of `Device`, two of `GdVersion`, and so on. Add a new shared
// enum here, never beside the endpoint that happens to use it first.

/**
 * The user's subjective difficulty read on a completion.
 *
 * The non-demon star values (`AUTO`..`NINE_STAR`) are a disagreement flag
 * only — the level itself stays a rated demon. Distinct from the level's
 * cached in-game difficulty. Use `opinionToStars` / `STAR_TO_OPINION` from
 * `@infernolog/core` to convert between this and a star count.
 */
export type DifficultyOpinion =
  | 'AUTO'
  | 'TWO_STAR'
  | 'THREE_STAR'
  | 'FOUR_STAR'
  | 'FIVE_STAR'
  | 'SIX_STAR'
  | 'SEVEN_STAR'
  | 'EIGHT_STAR'
  | 'NINE_STAR'
  | 'EASY'
  | 'MEDIUM'
  | 'HARD'
  | 'INSANE'
  | 'EXTREME'

/** Whether an entry is visible to other users, or only to its owner. */
export type EntryVisibility = 'PUBLIC' | 'PRIVATE'

/** The platform a run was played on. Lowercase on the wire, unlike the other enums. */
export type Device = 'pc' | 'mobile'

/**
 * Which game version's percentage semantics a logged percentage uses.
 *
 * 2.1 measured progress by distance to the endwall (so the counter moved at
 * a speed-dependent rate); 2.2 reworked it to time, where 100% is the
 * duration of the verification attempt. The same position can read as a
 * noticeably different number between the two.
 */
export type GdVersion = 'TWO_ONE' | 'TWO_TWO'

/** Whether a user's overall rating is a single number or a weighted average of categories. */
export type RatingMode = 'SIMPLE' | 'WEIGHTED'

/**
 * The scale ratings are shown on. Ratings are always stored as integers 0–100
 * internally regardless of this; conversion happens at the display layer via
 * `lib/ratingScale.ts`.
 */
export type RatingDisplayScale = 'ZERO_TO_TEN' | 'ZERO_TO_HUNDRED'

/** How calendar dates are ordered for display. Also selects 12h vs 24h time (`ISO` alone is 24h). */
export type DateFormatPreference = 'MDY' | 'DMY' | 'YMD' | 'ISO'

/** Whether a level is a classic (percentage) or platformer (time) level. */
export type LevelTypeFilter = 'CLASSIC' | 'PLATFORMER'
