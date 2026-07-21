import { z } from 'zod'
import {
  CollectionType,
  LevelType,
  RatingMode,
  Role,
  RatingDisplayScale,
  DateFormatPreference,
  DifficultyOpinion,
  EntryVisibility,
  LevelProgressStatus,
  ProgressUpdateKind,
  Device,
  GdVersion,
} from './enums'

export const LevelSchema = z.object({
  inGameId: z.string(),
  levelType: z.nativeEnum(LevelType),
  isRated: z.boolean(),
  isDemon: z.boolean(),
  name: z.string().nullable(),
  creator: z.string().nullable(),
  inGameDifficulty: z.string().nullable(),
  length: z.string().nullable(),
  songName: z.string().nullable(),
  songAuthor: z.string().nullable(),
  isNong: z.boolean(),
  nongSongTitle: z.string().nullable(),
  nongArtist: z.string().nullable(),
  nongSourceUrl: z.string().url().nullable(),
  peakMusicBpm: z.number().int().nullable(),
  // Extended level metadata — a snapshot of RobTop's level object. All
  // nullable: absent on manual rows and on rows cached before capture existed.
  description: z.string().nullable(),
  creatorPlayerId: z.string().nullable(),
  creatorAccountId: z.string().nullable(),
  creatorPoints: z.number().int().nullable(),
  stars: z.number().int().nullable(),
  starsRequested: z.number().int().nullable(),
  partialDiff: z.string().nullable(),
  difficultyFace: z.string().nullable(),
  downloads: z.number().int().nullable(),
  likes: z.number().int().nullable(),
  disliked: z.boolean().nullable(),
  objectCount: z.number().int().nullable(),
  largeLevel: z.boolean().nullable(),
  coins: z.number().int().nullable(),
  coinsVerified: z.boolean().nullable(),
  orbs: z.number().int().nullable(),
  diamonds: z.number().int().nullable(),
  featured: z.boolean().nullable(),
  featureScore: z.number().int().nullable(),
  epicValue: z.number().int().nullable(),
  twoPlayer: z.boolean().nullable(),
  lowDetailMode: z.boolean().nullable(),
  copiedFromId: z.string().nullable(),
  levelVersion: z.number().int().nullable(),
  gameVersion: z.string().nullable(),
  editorSeconds: z.number().int().nullable(),
  editorSecondsTotal: z.number().int().nullable(),
  officialSongId: z.number().int().nullable(),
  songId: z.string().nullable(),
  songLink: z.string().nullable(),
  songSize: z.string().nullable(),
  dataSource: z.string(),
  verified: z.boolean(),
})

export const ProgressUpdateInputSchema = z.object({
  levelProgressId: z.string().uuid(),
  isCompletion: z.boolean().default(false),
  percentage: z.number().min(0).max(100).nullable(), // For Classic
  runFrom: z.number().int().min(0).max(100).nullable(),
  runTo: z.number().int().min(0).max(100).nullable(),
  completionTime: z.number().int().nonnegative().nullable(), // For Platformer (seconds)
  attempts: z.number().int().nonnegative().nullable(),
  date: z.coerce.date().nullable(),
  dateUncertain: z.boolean().default(false),
  onStream: z.boolean().default(false),
  fps: z.number().int().positive().nullable(),
  peakHeartRateBpm: z.number().int().positive().nullable(),
  enjoyment: z.number().int().min(0).max(100).nullable(),
  simpleRating: z.number().int().min(0).max(100).nullable(),
  inGameDifficulty: z.string().nullable(),
  notes: z.string().max(2000).nullable(),
  videoUrl: z.string().url().nullable(),
  highlightUrl: z.string().url().nullable(),
})

export const PublicUserProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  profilePublic: z.boolean(),
  discordPublic: z.boolean(),
  createdAt: z.coerce.date(),
  // Derived or conditionally available (omitted sensitive fields like email, gddlApiKey, etc)
  role: z.nativeEnum(Role),
  isVerified: z.boolean(),
  discordId: z.string().nullable().optional(), // conditionally returned based on discordPublic
})

// ─────────────────────────────────────────────
// SETTINGS — request bodies for the /settings page
// ─────────────────────────────────────────────

export const USERNAME_RESERVED = ['admin', 'moderator', 'infernolog'] as const

export const UsernameSchema = z
  .string()
  .min(2, 'Username must be at least 2 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  )
  .refine(
    (val) =>
      !(USERNAME_RESERVED as readonly string[]).includes(val.toLowerCase()),
    'This username is reserved'
  )

export const UpdateUsernameSchema = z.object({
  username: UsernameSchema,
})

// GDDL API key — stored encrypted (AWS KMS) and never returned to clients.
// We only validate that it's a non-empty, sanely-bounded string; GDDL does not
// publish a fixed key format.
export const SetGddlApiKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, 'API key is required')
    .max(512, 'API key is too long'),
})

// Minimum FPS InfernoLog accepts. 60 is the Geometry Dash floor; anything
// lower isn't a real refresh rate users log against.
export const MIN_FPS = 60
// Upper bounds for otherwise-uncapped user-entered integer fields. Postgres
// Int columns overflow at 2^31-1; these caps sit far below that (and below
// the 1e21 threshold where JS starts stringifying numbers in scientific
// notation, which a bare .int() check doesn't reject) while still being far
// beyond any legitimate value, so a fat-fingered input fails cleanly with a
// normal validation error instead of an Int overflow at the database.
export const MAX_ATTEMPTS = 999_999_999
export const MAX_FPS = 100_000
export const MAX_GDDL_TIER = 10_000

export const UpdateMeSchema = z
  .object({
    profilePublic: z.boolean().optional(),
    discordPublic: z.boolean().optional(),
    defaultFps: z.number().int().min(MIN_FPS).max(MAX_FPS).optional(),
    defaultPercentageVersion: z.nativeEnum(GdVersion).optional(),
    dateFormatPreference: z.nativeEnum(DateFormatPreference).optional(),
    ratingMode: z.nativeEnum(RatingMode).optional(),
    ratingDisplayScale: z.nativeEnum(RatingDisplayScale).optional(),
    showHighlightUrl: z.boolean().optional(),
    includeEnjoyment: z.boolean().optional(),
    enjoymentWeight: z
      .string()
      .regex(/^(0|[1-9]\d*)\.\d{2}$/, {
        message: 'Must be a number with exactly 2 decimal places',
      })
      .refine(
        (val) => {
          const num = parseFloat(val)
          return num >= 0 && num <= 1
        },
        { message: 'Must be a number between 0 and 1' }
      )
      .optional(),
    // Not a column — the handler strips this and stamps legalAcceptedAt when true.
    acceptLegal: z.literal(true).optional(),
    onboardingCompleted: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'No fields to update')

// Weights are stored as Decimal(5,2): two decimal places, max 1.00. Active
// weights (categories plus enjoymentWeight when included) must sum to
// exactly 1.00. We validate using integer cents so 0.1 + 0.2 doesn't trip
// floating-point comparisons.
export const RATING_WEIGHT_SUM_TARGET_CENTS = 100

// Two-decimal precision check using a small float epsilon (rounding error
// from JSON.parse on values like "0.30" can leave 0.30000000000000004).
const isTwoDecimalWeight = (w: number): boolean =>
  Number.isFinite(w) && Math.abs(w * 100 - Math.round(w * 100)) < 1e-6

export const RatingConfigCategorySchema = z.object({
  // id is present for existing categories; omitted for new rows added in the
  // form-style editor. Server creates a new row when id is missing.
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(40),
  weight: z
    .number()
    .min(0)
    .max(1)
    .refine(isTwoDecimalWeight, 'Weights are limited to 2 decimal places'),
})

export const RatingConfigSchema = z
  .object({
    categories: z.array(RatingConfigCategorySchema).max(20),
    includeEnjoyment: z.boolean(),
    enjoymentWeight: z
      .number()
      .min(0)
      .max(1)
      .refine(isTwoDecimalWeight, 'Weights are limited to 2 decimal places'),
    // Position of the enjoyment row in the unified priority list. Bounded
    // generously — the UI never produces large values but we don't need
    // to be strict beyond a sanity ceiling.
    enjoymentSortOrder: z.number().int().min(0).max(999),
  })
  .superRefine((cfg, ctx) => {
    // Names unique per user — matches the DB @@unique([userId, name]).
    const seen = new Set<string>()
    for (const c of cfg.categories) {
      const key = c.name.trim().toLowerCase()
      if (!key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Category name is required',
          path: ['categories'],
        })
        return
      }
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate category name: ${c.name}`,
          path: ['categories'],
        })
        return
      }
      seen.add(key)
    }

    const cents =
      cfg.categories.reduce((acc, c) => acc + Math.round(c.weight * 100), 0) +
      (cfg.includeEnjoyment ? Math.round(cfg.enjoymentWeight * 100) : 0)
    if (cents !== RATING_WEIGHT_SUM_TARGET_CENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Active weights must sum to 1.00 (got ${(cents / 100).toFixed(2)})`,
        path: ['categories'],
      })
    }
  })

// ─────────────────────────────────────────────
// LOGGING FLOW — entry-creation request bodies
// The three FAB paths (completion / progress / drop) plus the level-entry
// support endpoints. See LOGGING_FLOW.md and DATA_MODEL.md.
//
// Ratings/enjoyment are integers 0–100 internally regardless of the user's
// display scale — the frontend converts at the display layer. The authenticated
// user always comes from the JWT, never from these payloads.
// ─────────────────────────────────────────────

// GD level IDs are numeric strings (the in-game id, also the Level PK).
export const LevelIdSchema = z
  .string()
  .regex(/^\d+$/, 'Level ID must be numeric')

// Fields shared by every logged entry's "session details" step.
const sessionDetailFields = {
  date: z.coerce.date().nullable().optional(),
  dateUncertain: z.boolean().default(false),
  attempts: z.number().int().nonnegative().max(MAX_ATTEMPTS).nullable().optional(),
  fps: z.number().int().positive().max(MAX_FPS).nullable().optional(),
  // Which GD version's percentage system was used. Only meaningful for classic
  // levels (percentage/runFrom/runTo). Null = not recorded.
  percentageVersion: z.nativeEnum(GdVersion).nullable().optional(),
  onStream: z.boolean().default(false),
  highlightUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  // Per-entry privacy, independent of global profile visibility.
  visibility: z.nativeEnum(EntryVisibility).default(EntryVisibility.PUBLIC),
  device: z.nativeEnum(Device).nullable().optional(),
}

// A single weighted-mode category score (0–100 internally).
export const RatingScoreInputSchema = z.object({
  categoryId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
})

// COMPLETION — 100% is implied, so no percentage/run-range. In-game difficulty
// is read from the cached level, never accepted from the client.
export const CompletionInputSchema = z.object({
  levelId: LevelIdSchema,
  ...sessionDetailFields,
  // Best run from 0% reached before beating the level (the user's "worst fail").
  worstFail: z.number().int().min(0).max(100).nullable().optional(),
  // Calendar date of the worst fail session. Omitted when the user checks
  // "I already logged my worst fail" (so the server keeps the existing value).
  worstFailDate: z.coerce.date().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable().optional(),
  // Non-demon difficulty opinion as a star count (1–9), only meaningful when
  // difficultyOpinion is NOT_DEMON_WORTHY.
  difficultyOpinionStars: z.number().int().min(1).max(9).nullable().optional(),
  enjoyment: z.number().int().min(0).max(100).nullable().optional(),
  // SIMPLE mode: a single rating. WEIGHTED mode: per-category scores. We store
  // whichever the client sends and never pre-compute the weighted average.
  simpleRating: z.number().int().min(0).max(100).nullable().optional(),
  ratingScores: z.array(RatingScoreInputSchema).optional(),
  userGddlTier: z.number().int().min(0).max(MAX_GDDL_TIER).nullable().optional(),
  // Coins collected bitmask (bit 0 = coin 1, bit 1 = coin 2, bit 2 = coin 3). 0–7.
  coinsCollected: z.number().int().min(0).max(7).nullable().optional(),
  // 2-player: true = beat solo, false = beat with partner. Null = not a 2P level.
  twoPlayerSolo: z.boolean().nullable().optional(),
  twoPlayerPartner: z.string().max(100).nullable().optional(),
})

// PROGRESS — discriminated on "From 0%" vs "From a run". Floors are 0.
// The cross-field runTo >= runFrom check lives in superRefine because a
// discriminated-union member must be a plain ZodObject (a per-member .refine
// would wrap it in ZodEffects, which the union rejects).
export const ProgressInputSchema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('from_zero'),
      levelId: LevelIdSchema,
      // Best progress so far (single value). Floor 0.
      percentage: z.number().min(0).max(100),
      enjoyment: z.number().int().min(0).max(100).nullable().optional(),
      ...sessionDetailFields,
    }),
    z.object({
      mode: z.literal('from_run'),
      levelId: LevelIdSchema,
      // Best run segment, e.g. 44 → 87. Both floored at 0.
      runFrom: z.number().int().min(0).max(100),
      runTo: z.number().int().min(0).max(100),
      enjoyment: z.number().int().min(0).max(100).nullable().optional(),
      ...sessionDetailFields,
    }),
  ])
  .superRefine((v, ctx) => {
    if (v.mode === 'from_run' && v.runTo < v.runFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'runTo must be greater than or equal to runFrom',
        path: ['runTo'],
      })
    }
  })

// DROP — backed by its own ProgressUpdate (kind=DROP), so it reuses the same
// date/attempts/notes fields completion and progress logs use rather than
// drop-specific synonyms. Drop-from-scratch is allowed (no prior progress
// required), and a level can be dropped more than once (drop → resume →
// drop again) — each drop is its own row, not an overwritten singleton.
export const DropInputSchema = z.object({
  levelId: LevelIdSchema,
  date: z.coerce.date().nullable().optional(),
  attempts: z.number().int().nonnegative().max(MAX_ATTEMPTS).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  // Best run from 0% reached before dropping (the user's "worst fail").
  worstFail: z.number().int().min(0).max(100).nullable().optional(),
  // Calendar date of the worst fail session.
  worstFailDate: z.coerce.date().nullable().optional(),
  visibility: z.nativeEnum(EntryVisibility).default(EntryVisibility.PUBLIC),
})

// EDIT PROGRESS — partial update applied to the most recent ProgressUpdate
// for a given level, plus LevelProgress-level metadata. All fields optional;
// only present keys are written. Sent as PATCH /v1/me/progress/:levelId.
export const EditProgressInputSchema = z.object({
  // When provided, targets this specific ProgressUpdate instead of the most recent
  progressUpdateId: z.string().uuid().optional(),
  // LevelProgress fields
  levelNotes: z.string().max(5000).nullable().optional(),
  worstFail: z.number().int().min(0).max(100).nullable().optional(),
  worstFailDate: z.coerce.date().nullable().optional(),
  visibility: z.nativeEnum(EntryVisibility).optional(),
  // ProgressUpdate fields
  date: z.coerce.date().nullable().optional(),
  dateUncertain: z.boolean().optional(),
  attempts: z.number().int().nonnegative().max(MAX_ATTEMPTS).nullable().optional(),
  fps: z.number().int().positive().max(MAX_FPS).nullable().optional(),
  percentageVersion: z.nativeEnum(GdVersion).nullable().optional(),
  onStream: z.boolean().optional(),
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable().optional(),
  difficultyOpinionStars: z.number().int().min(1).max(9).nullable().optional(),
  enjoyment: z.number().int().min(0).max(100).nullable().optional(),
  simpleRating: z.number().int().min(0).max(100).nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  highlightUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  ratingScores: z.array(RatingScoreInputSchema).optional(),
  coinsCollected: z.number().int().min(0).max(7).nullable().optional(),
  twoPlayerSolo: z.boolean().nullable().optional(),
  twoPlayerPartner: z.string().max(100).nullable().optional(),
  device: z.nativeEnum(Device).nullable().optional(),
  userGddlTier: z.number().int().min(0).max(MAX_GDDL_TIER).nullable().optional(),
})

// MANUAL LEVEL METADATA — the autofill-fallback form submit. The user-entered
// difficulty BECOMES the level's in-game difficulty (the one sanctioned
// exception to in-game-difficulty-is-read-only). Stored data_source=manual,
// verified=false so a later sync can backfill/verify.
export const ManualLevelInputSchema = z.object({
  inGameId: LevelIdSchema,
  name: z.string().min(1).max(200),
  creator: z.string().min(1).max(200),
  difficulty: z.string().min(1).max(100),
  // Whether the user picked a demon tier vs "Not a demon" on the manual form.
  // autofill was unavailable, so the client tells us; defaults to false.
  isDemon: z.boolean().optional(),
  // Whether the level is rated (has stars). Drives the rated-star badge.
  // Defaults to false; demons/autos are always rated, set by the client.
  isRated: z.boolean().optional(),
  songName: z.string().max(200).nullable().optional(),
  songAuthor: z.string().max(200).nullable().optional(),
  length: z.string().max(100).nullable().optional(),
})

// ─────────────────────────────────────────────
// LOGGING FLOW — response shapes (wire contracts)
// ─────────────────────────────────────────────

export const LevelSearchResultSchema = z.object({
  inGameId: z.string(),
  name: z.string().nullable(),
  creator: z.string().nullable(),
  songName: z.string().nullable(),
  inGameDifficulty: z.string().nullable(),
  // Drives the difficulty-face showcase glow in result rows.
  featured: z.boolean().nullable(),
  epicValue: z.number().int().nullable(),
  // Drives the rated-star badge on standard-difficulty faces.
  isRated: z.boolean(),
})

// The existing-completion summary folded into the resolve response so the
// client can pre-populate the edit form ("edit, not replace").
export const ExistingCompletionSchema = z.object({
  progressUpdateId: z.string().uuid(),
  date: z.coerce.date().nullable(),
  dateUncertain: z.boolean(),
  attempts: z.number().int().nullable(),
  worstFail: z.number().int().nullable(),
  worstFailDate: z.coerce.date().nullable(),
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable(),
  difficultyOpinionStars: z.number().int().nullable(),
  enjoyment: z.number().int().nullable(),
  simpleRating: z.number().int().nullable(),
  fps: z.number().int().nullable(),
  onStream: z.boolean(),
  videoUrl: z.string().nullable(),
  highlightUrl: z.string().nullable(),
  notes: z.string().nullable(),
  visibility: z.nativeEnum(EntryVisibility),
  device: z.nativeEnum(Device).nullable(),
  ratingScores: z.array(
    z.object({ categoryId: z.string().uuid(), score: z.number().int() })
  ),
  userGddlTier: z.number().int().nullable(),
  percentageVersion: z.nativeEnum(GdVersion).nullable(),
})

export const ResolveLevelResponseSchema = z.object({
  level: LevelSchema.nullable(),
  // True when autofill was unavailable/empty and the client should fall back
  // to the manual-entry form. Never accompanied by a 500.
  fallbackToManual: z.boolean(),
  // GDDL's suggested tier for the level (autofills the GDDL tier field on the
  // list-references step). Null when GDDL has no tier or is unavailable —
  // fetching it never blocks or fails the resolve.
  suggestedGddlTier: z.number().nullable(),
  existingCompletion: ExistingCompletionSchema.nullable(),
})

// ─────────────────────────────────────────────
// THE LIST — the List page wire contract.
//
// GET /v1/me/progress returns the authed user's full level-progress list in one
// payload (both PUBLIC and PRIVATE entries). All filtering, multi-key sorting,
// and column selection happen client-side, so each row carries the raw fields
// every filter/column needs rather than pre-filtered results. See
// docs/API_DESIGN.md and the list page design.
// ─────────────────────────────────────────────

// Trimmed level metadata for a list row — the difficulty face, name/creator,
// type, rated-status badges, and tier-badge context. A subset of LevelSchema.
export const LevelListSummarySchema = z.object({
  inGameId: z.string(),
  name: z.string().nullable(),
  creator: z.string().nullable(),
  levelType: z.nativeEnum(LevelType),
  inGameDifficulty: z.string().nullable(),
  isDemon: z.boolean(),
  isRated: z.boolean(),
  difficultyFace: z.string().nullable(),
  featured: z.boolean().nullable(),
  epicValue: z.number().int().nullable(),
  length: z.string().nullable(),
  // Extra optional columns the user can surface on the list.
  songName: z.string().nullable(),
  songAuthor: z.string().nullable(),
  coins: z.number().int().nullable(),
  coinsVerified: z.boolean().nullable(),
  twoPlayer: z.boolean().nullable(),
  gameVersion: z.string().nullable(),
  gddlTier: z.number().int().nullable(),
})

// The representative progress update folded into a list row: the completion
// update when the level is COMPLETED, otherwise the most recent update (which
// is the drop itself for a DROPPED level, now that drops are ordinary
// ProgressUpdate rows). Drives the Date / Attempts / Rating / Enjoyment /
// Status columns and most filters.
export const LevelProgressListEntrySchema = z.object({
  progressUpdateId: z.string().uuid(),
  kind: z.nativeEnum(ProgressUpdateKind),
  date: z.coerce.date().nullable(),
  dateUncertain: z.boolean(),
  attempts: z.number().int().nullable(),
  percentage: z.number().nullable(),
  runFrom: z.number().int().nullable(),
  runTo: z.number().int().nullable(),
  enjoyment: z.number().int().nullable(), // 0–100 internal scale
  // Computed at query time (never stored): simpleRating in SIMPLE mode, the
  // weighted average of ratingScores in WEIGHTED mode. 0–100 internal scale.
  overallRating: z.number().nullable(),
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable(),
  onStream: z.boolean(),
  fps: z.number().int().nullable(),
  percentageVersion: z.nativeEnum(GdVersion).nullable(),
  videoUrl: z.string().nullable(),
  highlightUrl: z.string().nullable(),
  notes: z.string().nullable(),
  device: z.nativeEnum(Device).nullable(),
  loggedAt: z.coerce.date(),
  // Per-category scores used for tie-breaking weighted-average sorts and for
  // individual category columns. Only meaningful in WEIGHTED mode.
  ratingScores: z.array(
    z.object({ categoryId: z.string(), score: z.number().int() })
  ),
})

export const LevelProgressListItemSchema = z.object({
  levelProgressId: z.string().uuid(),
  status: z.nativeEnum(LevelProgressStatus),
  visibility: z.nativeEnum(EntryVisibility),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  // Rolling "best known" worst-fail — level-scoped (not per-event) because the
  // logging UI asks for it once and remembers it ("already logged" checkbox)
  // rather than re-asking on every completion/drop.
  worstFail: z.number().int().nullable(),
  // Derived: a completed CLASSIC level with no ClassicRanking row yet.
  needsPlacement: z.boolean(),
  // The user's own GDDL tier opinion (set during completion logging or edit).
  userGddlTier: z.number().int().nullable(),
  level: LevelListSummarySchema,
  // Null only for the rare status row with zero progress updates.
  entry: LevelProgressListEntrySchema.nullable(),
})

export const LevelProgressListResponseSchema = z.object({
  data: z.array(LevelProgressListItemSchema),
})

// ─────────────────────────────────────────────
// CLASSIC RANKING — the personal difficulty-ordering page.
// ─────────────────────────────────────────────

// The GDDL tier badge shown on a ranking row / unplaced card.
// Sourced from LevelProgress.userGddlTier (the user's own opinion).
// Null when the user has not given a GDDL tier opinion for this level.
export const RankingBadgeSchema = z
  .object({
    gddlTier: z.number().int(),
  })
  .nullable()

export const ClassicRankingEntrySchema = z.object({
  // 1-based position in the placed list (ordered by rankingIndex DESC, so
  // #1 = hardest). The client recomputes these numbers for the "Show unrated"
  // filtered view; the server number reflects the full placed set.
  rank: z.number().int(),
  levelProgressId: z.string().uuid(),
  // The fractional index itself — exposed for debugging/inspection. Placement
  // and reorder only ever send neighbour IDs, never a raw index.
  rankingIndex: z.number(),
  level: LevelListSummarySchema,
  // Attempts on the completion update (null when not logged).
  attempts: z.number().int().nullable(),
  badge: RankingBadgeSchema,
})

export const UnplacedRankingEntrySchema = z.object({
  levelProgressId: z.string().uuid(),
  level: LevelListSummarySchema,
  attempts: z.number().int().nullable(),
  badge: RankingBadgeSchema,
})

// Both columns in one round trip — the page always renders them together.
export const ClassicRankingResponseSchema = z.object({
  placed: z.array(ClassicRankingEntrySchema),
  unplaced: z.array(UnplacedRankingEntrySchema),
})

// Drop-position neighbours, shared by place and reorder. The client identifies
// where an entry lands by its two visible neighbours:
//   aboveId — the entry shown directly ABOVE (harder → higher index)
//   belowId — the entry shown directly BELOW (easier → lower index)
// Omit aboveId to drop at the very top (hardest), belowId for the very bottom
// (easiest), or both for the first entry in an empty ranking. The server
// computes the fractional index between the neighbours and renormalises the
// whole list to integers when the gap closes past the rebalance threshold.
const rankingNeighbours = {
  aboveId: z.string().uuid().optional(),
  belowId: z.string().uuid().optional(),
}

export const PlaceRankingInputSchema = z.object({
  levelProgressId: z.string().uuid(),
  ...rankingNeighbours,
})

export const ReorderRankingInputSchema = z.object(rankingNeighbours)

// ─────────────────────────────────────────────
// COLLECTIONS — user-owned groupings of levels: the three built-ins
// (Want to Beat / Favorites / Least Favorites) plus custom named collections.
// Entry order is a fractional index (same pattern as the classic ranking);
// reads return entries ordered by rankingIndex asc.
// ─────────────────────────────────────────────

// Built-in collection names — reserved case-insensitively for custom names.
export const RESERVED_COLLECTION_NAMES = [
  'Want to Beat',
  'Favorites',
  'Least Favorites',
] as const

export const isReservedCollectionName = (name: string): boolean =>
  (RESERVED_COLLECTION_NAMES as readonly string[]).some(
    (r) => r.toLowerCase() === name.trim().toLowerCase()
  )

// Machine-readable error codes for collection writes.
export const COLLECTION_ERRORS = {
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  RESERVED_NAME: 'RESERVED_NAME',
  BUILT_IN_COLLECTION: 'BUILT_IN_COLLECTION',
  LEVEL_ALREADY_COMPLETED: 'LEVEL_ALREADY_COMPLETED',
  SELF_REFERENTIAL_NEIGHBOR: 'SELF_REFERENTIAL_NEIGHBOR',
} as const
export type CollectionErrorCode = keyof typeof COLLECTION_ERRORS

export const CreateCollectionInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(200).nullable().optional(),
})

// Rename/edit description — custom collections only (built-ins are immutable).
export const UpdateCollectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().max(200).nullable().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'No fields to update')

// Index-card summary: identity + count + the leading entries' level ids for
// the thumbnail-cluster preview (first entry = the identity thumbnail).
export const CollectionSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.nativeEnum(CollectionType),
  description: z.string().nullable(),
  entryCount: z.number().int(),
  previewLevelIds: z.array(z.string()),
  createdAt: z.coerce.date(),
})

export const CollectionsResponseSchema = z.object({
  data: z.array(CollectionSummarySchema),
})

// A member row: trimmed level metadata plus the completion-derived extras the
// row renders (GDDL/AREDL badge, completed state for the Want to Beat rules).
export const CollectionEntrySchema = z.object({
  id: z.string().uuid(),
  rankingIndex: z.number(),
  addedAt: z.coerce.date(),
  level: LevelListSummarySchema,
  badge: RankingBadgeSchema,
  // Whether the viewer's account has a completion for this level. Drives the
  // greyed "already completed" treatment in Want to Beat contexts.
  completed: z.boolean(),
})

export const CollectionDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.nativeEnum(CollectionType),
  description: z.string().nullable(),
  createdAt: z.coerce.date(),
  entries: z.array(CollectionEntrySchema),
})

export const AddCollectionEntryInputSchema = z.object({
  levelId: LevelIdSchema,
})

// Reorder neighbours, in display order (rankingIndex asc):
//   prevId — the entry shown directly ABOVE the drop slot (lower index)
//   nextId — the entry shown directly BELOW the drop slot (higher index)
// Omit prevId to move to the top, nextId for the bottom. The server bisects
// the gap and renormalises when it closes past the rebalance threshold.
export const ReorderCollectionEntryInputSchema = z
  .object({
    prevId: z.string().uuid().optional(),
    nextId: z.string().uuid().optional(),
  })
  .refine((v) => v.prevId || v.nextId, 'prevId or nextId is required')
  .refine((v) => v.prevId !== v.nextId, 'Neighbours must differ')

export const GddlSyncResultSchema = z.object({
  created: z.number().int(),
  enriched: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ levelId: z.string(), reason: z.string() })),
})
export type GddlSyncResult = z.infer<typeof GddlSyncResultSchema>

// ─────────────────────────────────────────────
// LIST PRESETS — saved view configurations for the List page.
//
// The four view-config fields (sorts, filters, columns, columnOrder) are treated
// as opaque JSON by the API — the frontend owns their schemas. The server stores
// and returns them verbatim without attempting deep validation.
// ─────────────────────────────────────────────

export const PRESET_COLOR_IDS = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'rose',
  'slate',
] as const
export type PresetColorId = (typeof PRESET_COLOR_IDS)[number]

export const ListPresetInputSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional().nullable(),
  color: z.enum(PRESET_COLOR_IDS),
  sorts: z.unknown(),
  filters: z.unknown(),
  columns: z.unknown(),
  columnOrder: z.unknown(),
})

export const ListPresetUpdateSchema = ListPresetInputSchema.partial()

export const ListPresetSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.enum(PRESET_COLOR_IDS),
  sorts: z.unknown(),
  filters: z.unknown(),
  columns: z.unknown(),
  columnOrder: z.unknown(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// ─────────────────────────────────────────────
// SPREADSHEET IMPORT — wire schemas
//
// The client parses the xlsx, interprets dates (ISO strings), and sends a
// normalized JSON payload. The server re-validates ranges/enums/required
// fields only — it trusts the ISO date strings from the client.
//
// Ratings in the import format are 0-10 (display scale per IMPORT_EXPORT.md).
// The server multiplies by 10 to convert to the 0-100 internal scale.
// ─────────────────────────────────────────────

export const ImportCompletionRowSchema = z.object({
  // levelId is optional — if omitted, the server resolves from levelName + creator.
  levelId: LevelIdSchema.nullable().optional(),
  levelName: z.string().nullable().optional(),
  // Creator name for disambiguation when levelId is absent.
  creator: z.string().nullable().optional(),
  // ISO 8601 date string, already interpreted by the client.
  date: z.string().nullable().optional(),
  dateUncertain: z.boolean().nullable().optional(),
  attempts: z.number().int().nonnegative().max(MAX_ATTEMPTS).nullable().optional(),
  // Worst fail / last logged percentage (0-100).
  percentage: z.number().min(0).max(100).nullable().optional(),
  // ISO 8601 date string — date of the worst fail session.
  worstFailDate: z.string().nullable().optional(),
  runFrom: z.number().int().min(0).max(100).nullable().optional(),
  runTo: z.number().int().min(0).max(100).nullable().optional(),
  onStream: z.boolean().nullable().optional(),
  fps: z.number().int().positive().max(MAX_FPS).nullable().optional(),
  // 0-10 display scale (server converts to 0-100 on write).
  enjoyment: z.number().min(0).max(10).nullable().optional(),
  simpleRating: z.number().min(0).max(10).nullable().optional(),
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable().optional(),
  // Non-demon star rating (1–9) — only meaningful when difficultyOpinion is
  // NOT_DEMON_WORTHY.
  difficultyOpinionStars: z.number().int().min(1).max(9).nullable().optional(),
  // User-coin collection as a bitmask (bit 0 = coin 1 … bit 2 = coin 3).
  // Ignored server-side for levels that have no user coins.
  coinsCollected: z.number().int().min(0).max(7).nullable().optional(),
  // 2-player: true = beaten solo, false = beaten with a partner (name in
  // twoPlayerPartner). Null = not a 2-player level or not logged.
  twoPlayerSolo: z.boolean().nullable().optional(),
  twoPlayerPartner: z.string().max(200).nullable().optional(),
  // Device the level was beaten on.
  device: z.nativeEnum(Device).nullable().optional(),
  // Per-entry privacy for the completion's LevelProgress.
  visibility: z.nativeEnum(EntryVisibility).nullable().optional(),
  // "About this level overall" note, stored on LevelProgress (distinct from the
  // per-completion `notes`).
  levelNotes: z.string().max(2000).nullable().optional(),
  // Ignored on import — server populates from the levels cache.
  inGameDifficulty: z.string().nullable().optional(),
  userGddlTier: z.number().int().min(0).max(MAX_GDDL_TIER).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  highlightUrl: z.string().url().nullable().optional(),
})

// A non-completion progress update — one logged session for a level that
// isn't (yet) the completion. Multiple rows can exist per level, unlike
// Completions/Dropped which are one-per-level. `progressId` is the round-trip
// identity (the ProgressUpdate.id, populated on export): present + matching →
// updates that entry in place; absent or unmatched → a new entry is created.
export const ImportProgressRowSchema = z.object({
  progressId: z.string().uuid().nullable().optional(),
  levelId: LevelIdSchema.nullable().optional(),
  levelName: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  dateUncertain: z.boolean().nullable().optional(),
  attempts: z.number().int().nonnegative().max(MAX_ATTEMPTS).nullable().optional(),
  percentage: z.number().min(0).max(100).nullable().optional(),
  runFrom: z.number().int().min(0).max(100).nullable().optional(),
  runTo: z.number().int().min(0).max(100).nullable().optional(),
  onStream: z.boolean().nullable().optional(),
  fps: z.number().int().positive().max(MAX_FPS).nullable().optional(),
  device: z.nativeEnum(Device).nullable().optional(),
  // 0-10 display scale (server converts to 0-100 on write).
  enjoyment: z.number().min(0).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  highlightUrl: z.string().url().nullable().optional(),
  visibility: z.nativeEnum(EntryVisibility).nullable().optional(),
  // Only used to disambiguate name resolution when levelId is absent.
  inGameDifficulty: z.string().nullable().optional(),
})

// Additive, like Progress — a level can be dropped more than once (drop →
// resume → drop again), so this is not one-row-per-level. `dropId` is the
// round-trip identity (the ProgressUpdate.id, populated on export): present +
// matching → updates that entry in place; absent or unmatched → a new drop
// entry is created.
export const ImportDroppedRowSchema = z.object({
  dropId: z.string().uuid().nullable().optional(),
  // levelId is optional — if omitted, the server resolves from levelName + creator.
  levelId: LevelIdSchema.nullable().optional(),
  levelName: z.string().nullable().optional(),
  // Creator name for disambiguation when levelId is absent.
  creator: z.string().nullable().optional(),
  // Best progress percentage (0-100).
  bestProgress: z.number().min(0).max(100).nullable().optional(),
  runFrom: z.number().int().min(0).max(100).nullable().optional(),
  runTo: z.number().int().min(0).max(100).nullable().optional(),
  attemptsAtDrop: z.number().int().nonnegative().max(MAX_ATTEMPTS).nullable().optional(),
  // ISO 8601 date string.
  droppedAt: z.string().nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
  // Only used to disambiguate name resolution when levelId is absent — the same
  // as the completions tab. Not stored.
  inGameDifficulty: z.string().nullable().optional(),
})

// ── Commit ─────────────────────────────────────────────────────────────────
//
// The check pass (defined further below, after the ranking/collections/
// ratings entry schemas it references) resolves every conflict client-side —
// by the time a row reaches /start, `data` already holds the final agreed
// field values. `resolution` exists only so the server can pick the right
// write branch and outcome-reporting text:
//   'drop'      — discard the imported row entirely, keep existing as-is.
//   'duplicate' — system-detected exact duplicate (progress/dropped only,
//                 never user-facing) — functionally identical to 'drop'.
//   'overwrite' — `data` is the full imported row, written unconditionally
//                 (including nulls, to clear fields the sheet leaves blank).
//   'merge'     — `data` is the user's field-by-field reconciliation result;
//                 from the server's perspective this is IDENTICAL to
//                 'overwrite' (write every field of `data` as final truth) —
//                 the tag exists only to report "merged" vs "overwritten".
export const ImportConflictActionSchema = z.enum([
  'drop',
  'duplicate',
  'overwrite',
  'merge',
])

export const ImportCommitRowSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('completion'),
    rowIndex: z.number().int().nonnegative(),
    data: ImportCompletionRowSchema,
    // Only required when a conflict exists for this level.
    resolution: ImportConflictActionSchema.optional(),
  }),
  z.object({
    type: z.literal('dropped'),
    rowIndex: z.number().int().nonnegative(),
    data: ImportDroppedRowSchema,
    // Only required when the check pass matched this row against an
    // existing drop by derived key (see checkImportConflicts).
    resolution: ImportConflictActionSchema.optional(),
  }),
  z.object({
    type: z.literal('progress'),
    rowIndex: z.number().int().nonnegative(),
    data: ImportProgressRowSchema,
    resolution: ImportConflictActionSchema.optional(),
  }),
])

export const ImportCommitRequestSchema = z.object({
  importJobId: z.string().uuid(),
  rows: z.array(ImportCommitRowSchema).min(1).max(50),
})

export const ImportCommitOutcomeSchema = z.object({
  rowIndex: z.number().int(),
  // 'committed' — a new entry was written.
  // 'updated'   — an existing entry was modified (overwrite/merge).
  // 'skipped'   — the row's data was not used at all (existing entry kept, or
  //               superseded by a later row for the same level).
  // 'failed'    — the row could not be processed.
  status: z.enum(['committed', 'updated', 'skipped', 'failed']),
  reason: z.string().optional(),
})

export const ImportCommitResponseSchema = z.object({
  outcomes: z.array(ImportCommitOutcomeSchema),
})

// ── Ranking ──────────────────────────────────────────────────────────────
//
// The ranking is a total order with replace semantics ("the sheet wins"), so
// it's committed in one dedicated call rather than through the row-batched path.
// Entries are ordered hardest → easiest; each must resolve to one of the user's
// own completed levels (ranking only applies to completions).

export const ImportRankingEntrySchema = z.object({
  levelId: LevelIdSchema.nullable().optional(),
  levelName: z.string().nullable().optional(),
})

export const ImportRankingRequestSchema = z.object({
  // Ordered hardest (index 0) → easiest.
  entries: z.array(ImportRankingEntrySchema).max(5000),
})

export const ImportRankingSkipSchema = z.object({
  rank: z.number().int(),
  label: z.string(),
  reason: z.string(),
})

export const ImportRankingResponseSchema = z.object({
  placed: z.number().int(),
  skipped: z.array(ImportRankingSkipSchema),
})

// ── Collections (the sheet's "Lists" tab) ──────────────────────────────────
//
// Like ranking, collection membership is committed in one dedicated call with
// replace-per-collection semantics: any collection the sheet names has its
// membership replaced; collections the sheet doesn't mention are left alone.
// The `list` value (the sheet's column — a user data contract, so the wire
// field keeps that name) is a reserved keyword (want_to_beat / favorites /
// least_favorites) or a custom collection name. Level identity resolves like
// the completion tabs (a collected level need not be completed).

export const ImportCollectionEntrySchema = z.object({
  list: z.string().min(1).max(200),
  levelId: LevelIdSchema.nullable().optional(),
  levelName: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  inGameDifficulty: z.string().nullable().optional(),
  // Optional explicit ordering within the collection; row order otherwise.
  position: z.number().int().nullable().optional(),
})

export const ImportCollectionsRequestSchema = z.object({
  entries: z.array(ImportCollectionEntrySchema).max(5000),
})

export const ImportCollectionsSkipSchema = z.object({
  list: z.string(),
  label: z.string(),
  reason: z.string(),
})

export const ImportCollectionsResponseSchema = z.object({
  lists: z.array(z.object({ list: z.string(), placed: z.number().int() })),
  skipped: z.array(ImportCollectionsSkipSchema),
})

// ── Ratings (weighted category scores) ─────────────────────────────────────
//
// One dedicated call, run after completions. Each entry is one level's category
// scores (already converted to the internal 0-100 scale by the client). Scores
// attach to the level's completion; categories are matched by name and created
// on demand. Merge semantics: only the categories named in the sheet are
// written — a completion's other category scores are left untouched.

export const ImportRatingEntrySchema = z.object({
  levelId: LevelIdSchema.nullable().optional(),
  levelName: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  inGameDifficulty: z.string().nullable().optional(),
  // category name → score (0-100, internal scale)
  scores: z.record(z.string(), z.number().int().min(0).max(100)),
})

export const ImportRatingsRequestSchema = z.object({
  entries: z.array(ImportRatingEntrySchema).max(5000),
})

export const ImportRatingsResponseSchema = z.object({
  scored: z.number().int(), // number of individual scores written
  levels: z.number().int(), // number of levels that received scores
  categoriesCreated: z.array(z.string()),
  skipped: z.array(z.object({ label: z.string(), reason: z.string() })),
})

// ── Conflict resolution (shared primitives) ─────────────────────────────────
//
// Powers the canonical git-merge-style resolution UI, reused across every tab
// that can conflict: Completions/Progress/Dropped share ImportRowConflict
// (a field-by-field diff); Ratings has its own single-field variant; Ranking
// and Collections share ImportListMerge (an ordered-list merge).

export const ImportFieldDiffSchema = z.object({
  field: z.string(),
  existingValue: z.unknown(),
  importedValue: z.unknown(),
})

// matchedId is null for completions (already round-trip by levelId); for
// progress/dropped it's the existing ProgressUpdate id the client folds back
// onto data.progressId/data.dropId so the existing id-match commit path
// picks it up unchanged.
export const ImportRowConflictSchema = z.object({
  rowIndex: z.number().int(),
  levelId: z.string(),
  levelName: z.string().nullable(),
  matchedId: z.string().nullable(),
  fields: z.array(ImportFieldDiffSchema).min(1),
})

// A system-detected exact duplicate (progress/dropped only) — no user
// interaction needed; the client marks the row resolution: 'duplicate'.
export const ImportDuplicateRowSchema = z.object({
  rowIndex: z.number().int(),
})

export const ImportRatingConflictSchema = z.object({
  levelId: z.string(),
  levelName: z.string().nullable(),
  categoryName: z.string(),
  // Internal 0-100 scale, same convention as ImportRatingEntry.scores.
  existingScore: z.number().int().min(0).max(100),
  importedScore: z.number().int().min(0).max(100),
})

export const ImportListEntrySchema = z.object({
  levelId: z.string(),
  levelName: z.string().nullable(),
})

// A git-like merge of two orderings (see computeListMerge in
// apps/api/src/utils/listMerge.ts for the exact algorithm). A pure insertion
// — an entry unique to one side whose position relative to the shared
// backbone is unambiguous — auto-resolves and never appears here; only a
// genuine order disagreement (or a pure omission — an existing entry the
// sheet doesn't mention at all) produces a non-empty remainder.
export const ImportListMergeSchema = z.object({
  list: z.string().nullable(), // collection name, or null for Ranking
  // The backbone with every unambiguous imported-only insertion already
  // spliced in. Pre-seeds the merge board's middle column. When hasConflict
  // is false, this array alone is the final order — nothing to render.
  mergedSeed: z.array(ImportListEntrySchema),
  // Entries present in both orderings but excluded from the backbone because
  // their relative position is disputed, in imported's order. Starts in the
  // left column.
  importedRemainder: z.array(ImportListEntrySchema),
  // The same disputed entries (in existing's order) unioned with entries
  // that exist only in the existing ordering. A levelId appearing in both
  // importedRemainder and existingRemainder is ONE contested entry, not two
  // — placing either instance resolves both. Starts in the right column.
  existingRemainder: z.array(ImportListEntrySchema),
  // True iff importedRemainder or existingRemainder is non-empty.
  hasConflict: z.boolean(),
  // The two full original orderings, un-merged — lets the merge board offer
  // "just use the spreadsheet" / "just keep what's in InfernoLog" as one-click
  // bulk resolutions instead of requiring every contested/omitted entry to be
  // dragged into place by hand.
  importedOrder: z.array(ImportListEntrySchema),
  existingOrder: z.array(ImportListEntrySchema),
})

// ── Check (conflict detection) ──────────────────────────────────────────────
//
// One synchronous pre-commit pass over every tab's parsed rows. Resolution
// happens entirely client-side from this response; /start then receives the
// same rows with `resolution` (and, for lists, the user-merged order) baked
// in — see ImportCommitRowSchema above.

const ImportCheckRow = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ rowIndex: z.number().int().nonnegative(), data })

export const ImportCheckRequestSchema = z.object({
  completions: z
    .array(ImportCheckRow(ImportCompletionRowSchema))
    .max(20000)
    .optional(),
  progress: z
    .array(ImportCheckRow(ImportProgressRowSchema))
    .max(20000)
    .optional(),
  dropped: z
    .array(ImportCheckRow(ImportDroppedRowSchema))
    .max(20000)
    .optional(),
  ratings: z.array(ImportRatingEntrySchema).max(5000).optional(),
  collections: z.array(ImportCollectionEntrySchema).max(5000).optional(),
  ranking: z.array(ImportRankingEntrySchema).max(5000).optional(),
})

export const ImportCheckResponseSchema = z.object({
  completionConflicts: z.array(ImportRowConflictSchema),
  progressConflicts: z.array(ImportRowConflictSchema),
  progressDuplicates: z.array(ImportDuplicateRowSchema),
  droppedConflicts: z.array(ImportRowConflictSchema),
  droppedDuplicates: z.array(ImportDuplicateRowSchema),
  ratingConflicts: z.array(ImportRatingConflictSchema),
  collectionsMerge: z.array(ImportListMergeSchema),
  rankingMerge: ImportListMergeSchema.nullable(),
})

// ── Background import job (start + status) ─────────────────────────────────
//
// POST /v1/me/import/start persists the whole validated dataset in one shot
// (row batches + the optional ranking/collections/ratings tabs) and returns
// immediately; a worker Lambda processes it in the background. GET
// /v1/me/import/status is polled for live progress and, once complete, the
// same outcome/flagged-row data the old synchronous response returned.

export const ImportStartRequestSchema = z.object({
  rows: z.array(ImportCommitRowSchema).min(1).max(20000),
  ranking: z.array(ImportRankingEntrySchema).optional(),
  collections: z.array(ImportCollectionEntrySchema).optional(),
  ratings: z.array(ImportRatingEntrySchema).optional(),
})

export const ImportStartResponseSchema = z.object({
  jobId: z.string().uuid(),
})

export const ImportFlaggedRowSchema = z.object({
  id: z.string(),
  rowIndex: z.number().int(),
  levelName: z.string().nullable(),
  identifier: z.string().nullable(),
  issueMessage: z.string(),
  resolved: z.boolean(),
})

export const ImportStatusResponseSchema = z.object({
  status: z.enum(['running', 'completed', 'failed']),
  totalRows: z.number().int(),
  processedRows: z.number().int(),
  error: z.string().nullable(),
  outcomeCounts: z.object({
    committed: z.number().int(),
    updated: z.number().int(),
    skipped: z.number().int(),
    failed: z.number().int(),
  }),
  flaggedRows: z.array(ImportFlaggedRowSchema),
  rankingResult: ImportRankingResponseSchema.nullable(),
  collectionsResult: ImportCollectionsResponseSchema.nullable(),
  ratingsResult: ImportRatingsResponseSchema.nullable(),
})

// ── Export ─────────────────────────────────────────────────────────────────
//
// GET /v1/me/export returns the account's data in a faithful domain form; the
// client formats it into the import-compatible spreadsheet (date formatting,
// 0-100 → 0-10 rating scale, coin bitmask → columns, etc.). Dates are ISO here.

export const ExportCompletionSchema = z.object({
  levelId: z.string(),
  levelName: z.string().nullable(),
  creator: z.string().nullable(),
  inGameDifficulty: z.string().nullable(),
  date: z.string().nullable(),
  dateUncertain: z.boolean(),
  attempts: z.number().int().nullable(),
  percentage: z.number().int().nullable(),
  worstFailDate: z.string().nullable(),
  runFrom: z.number().int().nullable(),
  runTo: z.number().int().nullable(),
  onStream: z.boolean(),
  fps: z.number().int().nullable(),
  device: z.string().nullable(),
  enjoyment: z.number().int().nullable(), // 0-100 internal
  simpleRating: z.number().int().nullable(), // 0-100 internal
  difficultyOpinion: z.string().nullable(),
  difficultyOpinionStars: z.number().int().nullable(),
  coinsCollected: z.number().int().nullable(),
  twoPlayerSolo: z.boolean().nullable(),
  twoPlayerPartner: z.string().nullable(),
  visibility: z.string(),
  notes: z.string().nullable(),
  levelNotes: z.string().nullable(),
  userGddlTier: z.number().int().nullable(),
  videoUrl: z.string().nullable(),
  highlightUrl: z.string().nullable(),
})

export const ExportProgressSchema = z.object({
  progressId: z.string(),
  levelId: z.string(),
  levelName: z.string().nullable(),
  creator: z.string().nullable(),
  date: z.string().nullable(),
  dateUncertain: z.boolean(),
  attempts: z.number().int().nullable(),
  percentage: z.number().nullable(), // 0-100, may carry decimals
  runFrom: z.number().int().nullable(),
  runTo: z.number().int().nullable(),
  onStream: z.boolean(),
  fps: z.number().int().nullable(),
  device: z.string().nullable(),
  enjoyment: z.number().int().nullable(), // 0-100 internal
  notes: z.string().nullable(),
  highlightUrl: z.string().nullable(),
  visibility: z.string(),
})

export const ExportDroppedSchema = z.object({
  dropId: z.string(),
  levelId: z.string(),
  levelName: z.string().nullable(),
  creator: z.string().nullable(),
  inGameDifficulty: z.string().nullable(),
  bestProgress: z.number().int().nullable(),
  attemptsAtDrop: z.number().int().nullable(),
  droppedAt: z.string().nullable(),
  reason: z.string().nullable(),
})

export const ExportRankingSchema = z.object({
  rank: z.number().int(),
  levelId: z.string(),
  levelName: z.string().nullable(),
})

export const ExportCollectionSchema = z.object({
  // The sheet's `list` column value (reserved keyword or custom name).
  list: z.string(),
  levelId: z.string(),
  levelName: z.string().nullable(),
  position: z.number().int(),
})

export const ExportRatingSchema = z.object({
  levelId: z.string(),
  levelName: z.string().nullable(),
  creator: z.string().nullable(),
  inGameDifficulty: z.string().nullable(),
  scores: z.record(z.string(), z.number().int()), // 0-100 internal
})

export const ExportResponseSchema = z.object({
  completions: z.array(ExportCompletionSchema),
  progress: z.array(ExportProgressSchema),
  dropped: z.array(ExportDroppedSchema),
  ranking: z.array(ExportRankingSchema),
  // Feeds the sheet's "Lists" tab (the tab name is a user data contract).
  collections: z.array(ExportCollectionSchema),
  ratingCategories: z.array(z.string()),
  ratings: z.array(ExportRatingSchema),
})

// The export is fetched section by section with offset pagination, so no single
// response can blow past API Gateway's response cap for a large account. The
// client stitches the sections back into an ExportResponse.
export const EXPORT_SECTIONS = [
  'completions',
  'progress',
  'dropped',
  'ranking',
  'collections',
  'ratings',
  'categories',
] as const
export type ExportSection = (typeof EXPORT_SECTIONS)[number]

export const ExportPageResponseSchema = z.object({
  items: z.array(z.unknown()),
  hasMore: z.boolean(),
})

export type ImportCompletionRow = z.infer<typeof ImportCompletionRowSchema>
export type ImportProgressRow = z.infer<typeof ImportProgressRowSchema>
export type ImportDroppedRow = z.infer<typeof ImportDroppedRowSchema>
export type ImportConflictAction = z.infer<typeof ImportConflictActionSchema>
export type ImportFieldDiff = z.infer<typeof ImportFieldDiffSchema>
export type ImportRowConflict = z.infer<typeof ImportRowConflictSchema>
export type ImportDuplicateRow = z.infer<typeof ImportDuplicateRowSchema>
export type ImportRatingConflict = z.infer<typeof ImportRatingConflictSchema>
export type ImportListEntry = z.infer<typeof ImportListEntrySchema>
export type ImportListMerge = z.infer<typeof ImportListMergeSchema>
export type ImportCheckRequest = z.infer<typeof ImportCheckRequestSchema>
export type ImportCheckResponse = z.infer<typeof ImportCheckResponseSchema>
export type ImportCommitRequest = z.infer<typeof ImportCommitRequestSchema>
export type ImportCommitResponse = z.infer<typeof ImportCommitResponseSchema>
export type ImportCommitRow = z.infer<typeof ImportCommitRowSchema>
export type ImportRankingEntry = z.infer<typeof ImportRankingEntrySchema>
export type ImportRankingRequest = z.infer<typeof ImportRankingRequestSchema>
export type ImportRankingResponse = z.infer<typeof ImportRankingResponseSchema>
export type ImportCollectionEntry = z.infer<typeof ImportCollectionEntrySchema>
export type ImportCollectionsRequest = z.infer<
  typeof ImportCollectionsRequestSchema
>
export type ImportCollectionsResponse = z.infer<
  typeof ImportCollectionsResponseSchema
>
export type ImportRatingEntry = z.infer<typeof ImportRatingEntrySchema>
export type ImportRatingsRequest = z.infer<typeof ImportRatingsRequestSchema>
export type ImportRatingsResponse = z.infer<typeof ImportRatingsResponseSchema>
export type ImportStartRequest = z.infer<typeof ImportStartRequestSchema>
export type ImportStartResponse = z.infer<typeof ImportStartResponseSchema>
export type ImportFlaggedRow = z.infer<typeof ImportFlaggedRowSchema>
export type ImportStatusResponse = z.infer<typeof ImportStatusResponseSchema>
export type ExportCompletion = z.infer<typeof ExportCompletionSchema>
export type ExportProgress = z.infer<typeof ExportProgressSchema>
export type ExportDropped = z.infer<typeof ExportDroppedSchema>
export type ExportRanking = z.infer<typeof ExportRankingSchema>
export type ExportCollection = z.infer<typeof ExportCollectionSchema>
export type ExportRating = z.infer<typeof ExportRatingSchema>
export type ExportResponse = z.infer<typeof ExportResponseSchema>
export type ExportPageResponse = z.infer<typeof ExportPageResponseSchema>
