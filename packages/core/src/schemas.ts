import { z } from 'zod'
import {
  LevelType,
  ListSource,
  RatingMode,
  Role,
  RatingDisplayScale,
  DateFormatPreference,
  DifficultyOpinion,
  EntryVisibility,
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
  // Extended GDBrowser metadata — a snapshot of RobTop's level object. All
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

export const ListReferenceInputSchema = z.object({
  progressUpdateId: z.string().uuid(),
  listSource: z.nativeEnum(ListSource),
  tierOrRank: z.string(),
  atTimeOfLogging: z.boolean().default(true),
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

export const UpdateMeSchema = z
  .object({
    profilePublic: z.boolean().optional(),
    discordPublic: z.boolean().optional(),
    defaultFps: z.number().int().min(MIN_FPS).optional(),
    dateFormatPreference: z.nativeEnum(DateFormatPreference).optional(),
    ratingMode: z.nativeEnum(RatingMode).optional(),
    ratingDisplayScale: z.nativeEnum(RatingDisplayScale).optional(),
    includeEnjoyment: z.boolean().optional(),
    enjoymentWeight: z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/, { message: 'Must be a number with exactly 2 decimal places' }).refine((val) => {
      const num = parseFloat(val)
      return num >= 0 && num <= 1
    }, { message: 'Must be a number between 0 and 1' }).optional(),
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
export const LevelIdSchema = z.string().regex(/^\d+$/, 'Level ID must be numeric')

// Fields shared by every logged entry's "session details" step.
const sessionDetailFields = {
  date: z.coerce.date().nullable().optional(),
  dateUncertain: z.boolean().default(false),
  attempts: z.number().int().nonnegative().nullable().optional(),
  fps: z.number().int().positive().nullable().optional(),
  onStream: z.boolean().default(false),
  highlightUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  // Per-entry privacy, independent of global profile visibility.
  visibility: z.nativeEnum(EntryVisibility).default(EntryVisibility.PUBLIC),
}

// A single weighted-mode category score (0–100 internally).
export const RatingScoreInputSchema = z.object({
  categoryId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
})

// A community-list tier/rank attached to a completion. Pointercrate is cut —
// only GDDL / AREDL / NLW / OTHER are valid sources.
export const CompletionListReferenceSchema = z.object({
  listSource: z.nativeEnum(ListSource),
  tierOrRank: z.string().min(1),
  atTimeOfLogging: z.boolean().default(true),
})

// COMPLETION — 100% is implied, so no percentage/run-range. In-game difficulty
// is read from the cached level, never accepted from the client.
export const CompletionInputSchema = z.object({
  levelId: LevelIdSchema,
  ...sessionDetailFields,
  videoUrl: z.string().url().nullable().optional(),
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable().optional(),
  enjoyment: z.number().int().min(0).max(100).nullable().optional(),
  // SIMPLE mode: a single rating. WEIGHTED mode: per-category scores. We store
  // whichever the client sends and never pre-compute the weighted average.
  simpleRating: z.number().int().min(0).max(100).nullable().optional(),
  ratingScores: z.array(RatingScoreInputSchema).optional(),
  listReferences: z.array(CompletionListReferenceSchema).optional(),
  // Optional GDDL record submission side effect (non-blocking). Only honored
  // when the user has a GDDL key configured.
  submitToGddl: z.boolean().default(false),
  // Self-reported "mark record as accepted" toggle (GDDL). Independent of
  // submitToGddl — the user flips it once GDDL accepts the record. When
  // provided, upserts the GDDL RecordAcceptance; omit to leave it unchanged.
  gddlRecordAccepted: z.boolean().optional(),
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

// DROP — a status transition with optional metadata. Drop-from-scratch is
// allowed (no prior progress required).
export const DropInputSchema = z.object({
  levelId: LevelIdSchema,
  droppedAt: z.coerce.date().nullable().optional(),
  attemptsAtDrop: z.number().int().nonnegative().nullable().optional(),
  droppedReason: z.string().max(2000).nullable().optional(),
  visibility: z.nativeEnum(EntryVisibility).default(EntryVisibility.PUBLIC),
})

// MANUAL LEVEL METADATA — the GDBrowser-fallback form submit. The user-entered
// difficulty BECOMES the level's in-game difficulty (the one sanctioned
// exception to in-game-difficulty-is-read-only). Stored data_source=manual,
// verified=false so a later sync can backfill/verify.
export const ManualLevelInputSchema = z.object({
  inGameId: LevelIdSchema,
  name: z.string().min(1).max(200),
  creator: z.string().min(1).max(200),
  difficulty: z.string().min(1).max(100),
  // Whether the user picked a demon tier vs "Not a demon" on the manual form.
  // GDBrowser was unavailable, so the client tells us; defaults to false.
  isDemon: z.boolean().optional(),
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
  inGameDifficulty: z.string().nullable(),
  // Drives the difficulty-face showcase glow in result rows.
  featured: z.boolean().nullable(),
  epicValue: z.number().int().nullable(),
})

// The existing-completion summary folded into the resolve response so the
// client can pre-populate the edit form ("edit, not replace").
export const ExistingCompletionSchema = z.object({
  progressUpdateId: z.string().uuid(),
  date: z.coerce.date().nullable(),
  dateUncertain: z.boolean(),
  attempts: z.number().int().nullable(),
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable(),
  enjoyment: z.number().int().nullable(),
  simpleRating: z.number().int().nullable(),
  fps: z.number().int().nullable(),
  onStream: z.boolean(),
  videoUrl: z.string().nullable(),
  highlightUrl: z.string().nullable(),
  notes: z.string().nullable(),
  visibility: z.nativeEnum(EntryVisibility),
  // Self-reported GDDL record-accepted state, to prefill the edit form's
  // "mark record as accepted" toggle. Null when no GDDL acceptance row exists.
  gddlRecordAccepted: z.boolean().nullable(),
  ratingScores: z.array(
    z.object({ categoryId: z.string().uuid(), score: z.number().int() })
  ),
  listReferences: z.array(
    z.object({
      listSource: z.nativeEnum(ListSource),
      tierOrRank: z.string(),
      atTimeOfLogging: z.boolean(),
    })
  ),
})

export const ResolveLevelResponseSchema = z.object({
  level: LevelSchema.nullable(),
  // True when GDBrowser was unavailable/empty and the client should fall back
  // to the manual-entry form. Never accompanied by a 500.
  fallbackToManual: z.boolean(),
  // GDDL's suggested tier for the level (autofills the GDDL tier field on the
  // list-references step). Null when GDDL has no tier or is unavailable —
  // fetching it never blocks or fails the resolve.
  suggestedGddlTier: z.number().nullable(),
  existingCompletion: ExistingCompletionSchema.nullable(),
})
