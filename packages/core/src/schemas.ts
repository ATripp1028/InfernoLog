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
  // Song File Hub NONG data (null unless isNong; sfhCheckedAt is internal and
  // not on the wire). sfhSongName is the raw "Artist - Title" string.
  sfhId: z.string().nullable(),
  sfhSongName: z.string().nullable(),
  sfhYoutubeUrl: z.string().nullable(),
  sfhYoutubeVideoId: z.string().nullable(),
  sfhDownloadUrl: z.string().nullable(),
  sfhFileType: z.string().nullable(),
  sfhDownloads: z.number().int().nullable(),
  // Extended level metadata — a snapshot of RobTop's level object. All
  // nullable: absent on manual rows and on rows cached before capture existed.
  description: z.string().nullable(),
  creatorPlayerId: z.string().nullable(),
  creatorAccountId: z.string().nullable(),
  stars: z.number().int().nullable(),
  starsRequested: z.number().int().nullable(),
  partialDiff: z.string().nullable(),
  downloads: z.number().int().nullable(),
  likes: z.number().int().nullable(),
  disliked: z.boolean().nullable(),
  objectCount: z.number().int().nullable(),
  coins: z.number().int().nullable(),
  coinsVerified: z.boolean().nullable(),
  featured: z.boolean().nullable(),
  featureScore: z.number().int().nullable(),
  epicValue: z.number().int().nullable(),
  twoPlayer: z.boolean().nullable(),
  lowDetailMode: z.boolean().nullable(),
  copiedFromId: z.string().nullable(),
  levelVersion: z.number().int().nullable(),
  gameVersion: z.string().nullable(),
  officialSongId: z.number().int().nullable(),
  songId: z.string().nullable(),
  songLink: z.string().nullable(),
  // Raw megabyte value (e.g. 9.56). Format at the display layer.
  songSize: z.number().nullable(),
  dataSource: z.string(),
  verified: z.boolean(),
})

// The Global Level Page (`GET /v1/levels/:levelId/page`) wire shape: everything
// LevelSchema carries, plus two fields the logging flow treats as internal —
// delistedAt (drives the frozen-as-of banner) and lastCheckedAt (its date) —
// and hasUserProgress, an EXISTENCE check against the user's level_progress (no
// progress values are sent). Dates arrive as ISO strings.
export const GlobalLevelPageSchema = LevelSchema.extend({
  delistedAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  hasUserProgress: z.boolean(),
})
export type GlobalLevelPage = z.infer<typeof GlobalLevelPageSchema>

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
    defaultDevice: z.nativeEnum(Device).optional(),
    dateFormatPreference: z.nativeEnum(DateFormatPreference).optional(),
    ratingMode: z.nativeEnum(RatingMode).optional(),
    ratingDisplayScale: z.nativeEnum(RatingDisplayScale).optional(),
    showHighlightUrl: z.boolean().optional(),
    autoExpandFabLabels: z.boolean().optional(),
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

// Shared by the settings editor and the spreadsheet import's on-demand
// category creation, so the two cannot disagree on what a category may be
// named.
export const MAX_RATING_CATEGORY_NAME_LENGTH = 40
export const MAX_RATING_CATEGORIES = 20

export const RatingConfigCategorySchema = z.object({
  // id is present for existing categories; omitted for new rows added in the
  // form-style editor. Server creates a new row when id is missing.
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(MAX_RATING_CATEGORY_NAME_LENGTH),
  weight: z
    .number()
    .min(0)
    .max(1)
    .refine(isTwoDecimalWeight, 'Weights are limited to 2 decimal places'),
})

export const RatingConfigSchema = z
  .object({
    categories: z.array(RatingConfigCategorySchema).max(MAX_RATING_CATEGORIES),
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
// support endpoints. See LOGGING_FLOW.md and apps/api/prisma/schema.prisma.
//
// Ratings/enjoyment are integers 0–100 internally regardless of the user's
// display scale — the frontend converts at the display layer. The authenticated
// user always comes from the JWT, never from these payloads.
// ─────────────────────────────────────────────

// GD level IDs are numeric strings (the in-game id, also the Level PK).
//
// The length cap matters as much as the numeric check: this value becomes a
// PRIMARY KEY on `levels` via POST /v1/levels, so without it a caller could
// insert megabyte-long "ids" into the shared level cache and into every index
// on it. Real GD ids are ~7-8 digits; 20 leaves generous headroom.
export const MAX_LEVEL_ID_LENGTH = 20

export const LevelIdSchema = z
  .string()
  .regex(/^\d+$/, 'Level ID must be numeric')
  .max(MAX_LEVEL_ID_LENGTH, 'Level ID is too long')

// Validity check for a user-submitted timezone string — rejects clearly
// invalid values at the write boundary rather than storing a string that
// throws when Intl.DateTimeFormat is later constructed from it for display.
// Attempts actual construction rather than checking membership in
// Intl.supportedValuesOf('timeZone')'s list — that list excludes some
// spec-legal values the constructor still accepts (notably 'UTC' itself).
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const timezoneField = z
  .string()
  .refine(isValidTimeZone, { message: 'Must be a valid IANA time zone name' })
  .nullable()
  .optional()

// Every user-supplied URL that reaches the API (video links, highlight clips)
// is rendered straight into an `href` by the frontend, so the accepted scheme
// set is a security boundary, not a formatting preference. zod's `.url()` is
// `new URL()` in a try/catch, which happily accepts `javascript:alert(1)` and
// `data:text/html,...` — both of which execute when the resulting anchor is
// clicked. Allow only http/https, and cap the length so a stored URL can't be
// used as bulk storage.
//
// Use this instead of `z.string().url()` for ANY value that originates with a
// user. The one place a bare `.url()` is still fine is a URL the server itself
// constructs.
export const MAX_URL_LENGTH = 2048

// Matched rather than parsed with `new URL()`: this package compiles against
// the ES2020 lib alone (no DOM, no node types) so it stays usable from both the
// browser app and Lambda, and a pattern is in any case the stricter of the two
// — it accepts a subset of what the URL parser does, which is the direction to
// err in for a security check.
//
// Control characters and whitespace are rejected outright: browsers strip
// TAB/LF/CR from an href before resolving it, so "java\tscript:x" would
// otherwise be a live bypass of an anchored scheme test.
const HTTP_URL_PATTERN = /^https?:\/\/[^/?#\s]+/i
const CONTROL_OR_SPACE_PATTERN = /[\s\u0000-\u001f\u007f]/

export const HttpUrlSchema = z
  .string()
  .max(MAX_URL_LENGTH, 'URL is too long')
  .refine(
    (value) =>
      !CONTROL_OR_SPACE_PATTERN.test(value) && HTTP_URL_PATTERN.test(value),
    'URL must start with http:// or https://'
  )

// Fields shared by every logged entry's "session details" step.
const sessionDetailFields = {
  date: z.coerce.date().nullable().optional(),
  // IANA zone the time-of-day on `date` was entered in (e.g. "America/New_York").
  // Null/omitted means no time was entered — `date` is a bare calendar date.
  dateTimezone: timezoneField,
  dateUncertain: z.boolean().default(false),
  attempts: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_ATTEMPTS)
    .nullable()
    .optional(),
  fps: z.number().int().positive().max(MAX_FPS).nullable().optional(),
  // Which GD version's percentage system was used. Only meaningful for classic
  // levels (percentage/runFrom/runTo). Null = not recorded.
  percentageVersion: z.nativeEnum(GdVersion).nullable().optional(),
  onStream: z.boolean().default(false),
  highlightUrl: HttpUrlSchema.nullable().optional(),
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
  // Date/time of the worst fail session. Omitted when the user checks
  // "I already logged my worst fail" (so the server keeps the existing value).
  worstFailDate: z.coerce.date().nullable().optional(),
  // IANA zone the time-of-day on worstFailDate was entered in. Null/omitted
  // means no time was entered.
  worstFailDateTimezone: timezoneField,
  videoUrl: HttpUrlSchema.nullable().optional(),
  // The non-demon star values (AUTO..NINE_STAR) carry their own star count —
  // no separate paired field.
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable().optional(),
  // enjoyment is logged per-event on the ProgressUpdate (see schema.prisma).
  enjoyment: z.number().int().min(0).max(100).nullable().optional(),
  // LevelProgress fields — one current value per level, not per event.
  // SIMPLE mode: a single rating. WEIGHTED mode: per-category scores. We store
  // whichever the client sends and never pre-compute the weighted average.
  simpleRating: z.number().int().min(0).max(100).nullable().optional(),
  ratingScores: z.array(RatingScoreInputSchema).optional(),
  userGddlTier: z
    .number()
    .int()
    .min(0)
    .max(MAX_GDDL_TIER)
    .nullable()
    .optional(),
  // Coins collected bitmask (bit 0 = coin 1, bit 1 = coin 2, bit 2 = coin 3). 0–7.
  coinsCollected: z.number().int().min(0).max(7).nullable().optional(),
  // Platformer only (v2, no UI yet): time of the completing attempt, seconds.
  completionTime: z.number().int().nonnegative().nullable().optional(),
  // 2-player: true = beat solo, false = beat with partner. Null = not a 2P level.
  twoPlayerSolo: z.boolean().nullable().optional(),
  twoPlayerPartner: z.string().max(100).nullable().optional(),
})

// PROGRESS — discriminated on "From 0%" vs "From a run". Floors are 0. 0% is
// not a loggable run (it's not progress) — percentage must be > 0, and a
// from_run entry must span a non-empty range (runTo > runFrom).
// The cross-field runTo > runFrom check lives in superRefine because a
// discriminated-union member must be a plain ZodObject (a per-member .refine
// would wrap it in ZodEffects, which the union rejects).
export const ProgressInputSchema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('from_zero'),
      levelId: LevelIdSchema,
      // Best progress so far (single value). 0% isn't a run.
      percentage: z.number().gt(0).max(100),
      enjoyment: z.number().int().min(0).max(100).nullable().optional(),
      ...sessionDetailFields,
    }),
    z.object({
      mode: z.literal('from_run'),
      levelId: LevelIdSchema,
      // Best run segment, e.g. 44 → 87. runFrom floored at 0.
      runFrom: z.number().int().min(0).max(100),
      runTo: z.number().int().min(0).max(100),
      enjoyment: z.number().int().min(0).max(100).nullable().optional(),
      ...sessionDetailFields,
    }),
  ])
  .superRefine((v, ctx) => {
    if (v.mode === 'from_run' && v.runTo <= v.runFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'runTo must be greater than runFrom',
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
  dateTimezone: timezoneField,
  attempts: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_ATTEMPTS)
    .nullable()
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  // Best run from 0% reached before dropping (the user's "worst fail").
  worstFail: z.number().int().min(0).max(100).nullable().optional(),
  // Date/time of the worst fail session.
  worstFailDate: z.coerce.date().nullable().optional(),
  worstFailDateTimezone: timezoneField,
  visibility: z.nativeEnum(EntryVisibility).default(EntryVisibility.PUBLIC),
})

// EDIT PROGRESS — partial update applied to the most recent ProgressUpdate
// for a given level, plus LevelProgress-level metadata. All fields optional;
// only present keys are written. Sent as PATCH /v1/me/progress/:levelId.
export const EditProgressInputSchema = z
  .object({
    // When provided, targets this specific ProgressUpdate instead of the most recent
    progressUpdateId: z.string().uuid().optional(),
    // LevelProgress fields
    levelNotes: z.string().max(5000).nullable().optional(),
    worstFail: z.number().int().min(0).max(100).nullable().optional(),
    worstFailDate: z.coerce.date().nullable().optional(),
    worstFailDateTimezone: timezoneField,
    visibility: z.nativeEnum(EntryVisibility).optional(),
    // One current value per level, not per event — editable regardless of
    // which ProgressUpdate is being viewed.
    simpleRating: z.number().int().min(0).max(100).nullable().optional(),
    ratingScores: z.array(RatingScoreInputSchema).optional(),
    coinsCollected: z.number().int().min(0).max(7).nullable().optional(),
    // Platformer only (v2, no UI yet): time of the completing attempt, seconds.
    completionTime: z.number().int().nonnegative().nullable().optional(),
    userGddlTier: z
      .number()
      .int()
      .min(0)
      .max(MAX_GDDL_TIER)
      .nullable()
      .optional(),
    // ProgressUpdate fields
    date: z.coerce.date().nullable().optional(),
    dateTimezone: timezoneField,
    dateUncertain: z.boolean().optional(),
    attempts: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_ATTEMPTS)
      .nullable()
      .optional(),
    fps: z.number().int().positive().max(MAX_FPS).nullable().optional(),
    percentageVersion: z.nativeEnum(GdVersion).nullable().optional(),
    onStream: z.boolean().optional(),
    // The non-demon star values (AUTO..NINE_STAR) carry their own star count —
    // no separate paired field.
    difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable().optional(),
    enjoyment: z.number().int().min(0).max(100).nullable().optional(),
    videoUrl: HttpUrlSchema.nullable().optional(),
    highlightUrl: HttpUrlSchema.nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    twoPlayerSolo: z.boolean().nullable().optional(),
    twoPlayerPartner: z.string().max(100).nullable().optional(),
    device: z.nativeEnum(Device).nullable().optional(),
    // Percentage/run-range editing — only meaningful for kind=PROGRESS
    // entries (completions are implied 100%, drops don't track a
    // percentage). Mutually exclusive with runFrom/runTo, same as the
    // from_zero/from_run split in ProgressInputSchema above — enforced in
    // applyEdit (apps/api/src/services/progress.ts), not here, since this
    // is a flat partial-update schema rather than a discriminated union.
    // 0% isn't a run, so percentage (like ProgressInputSchema's) must be > 0.
    percentage: z.number().gt(0).max(100).nullable().optional(),
    runFrom: z.number().int().min(0).max(100).nullable().optional(),
    runTo: z.number().int().min(0).max(100).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.runFrom != null && v.runTo != null && v.runTo <= v.runFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'runTo must be greater than runFrom',
        path: ['runTo'],
      })
    }
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
  // The awarded star count, for a rated non-demon. Sent separately from
  // `difficulty` because the face does NOT determine it — a "Hard" level is 4
  // or 5 stars — and the count is the canonical identifier, so the form asks
  // for it directly rather than guessing (see starDifficulty.ts). Omitted for
  // demons (always 10) and unrated levels (no stars).
  stars: z.number().int().min(1).max(10).nullable().optional(),
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
  // Star count (null for unrated). Rendered alongside the difficulty in a row.
  stars: z.number().int().nullable(),
  // Drives the difficulty-face showcase glow in result rows.
  featured: z.boolean().nullable(),
  epicValue: z.number().int().nullable(),
  // Drives the rated-star badge on standard-difficulty faces.
  isRated: z.boolean(),
})

// GET /v1/levels/gd-search response — the opt-in GD-server escalation. Three
// outcomes the client branches on: `ok` (new levels found, rated grouped
// first and already seeded, unrated returned unseeded), `nothing_new` (the
// call succeeded but every result was already cached — a result, not a
// failure), and `unreachable` (the RobTop call failed — retryable, sent with a
// 503). See the SpecNote decision record.
export const GdSearchResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    rated: z.array(LevelSearchResultSchema),
    unrated: z.array(LevelSearchResultSchema),
  }),
  z.object({
    status: z.literal('nothing_new'),
    totalFound: z.number().int(),
  }),
  z.object({
    status: z.literal('unreachable'),
  }),
])

// ─────────────────────────────────────────────
// LEVEL BROWSE — filters, sort, and the cursor-paginated cache search that
// backs the /search page's results grid (GET /v1/levels/browse).
// ─────────────────────────────────────────────

// Difficulty tokens exactly as stored on Level.partialDiff (see deriveDifficulty
// in apps/api/src/utils/robtop.ts). 'na' (unrated) is deliberately omitted here —
// the unrated case is expressed through the rate-status filter instead.
export const LevelDifficultySchema = z.enum([
  'auto',
  'easy',
  'normal',
  'hard',
  'harder',
  'insane',
  'demon-easy',
  'demon-medium',
  'demon-hard',
  'demon-insane',
  'demon-extreme',
])

// Showcase / rating status. Selecting several ORs them together.
//   unrated → isRated=false · rated → isRated=true · featured → featured=true
//   epic → epicValue=1 · legendary → epicValue=2 · mythic → epicValue=3
export const LevelRateStatusSchema = z.enum([
  'unrated',
  'rated',
  'featured',
  'epic',
  'legendary',
  'mythic',
])

// Length label as stored on Level.length, lowercased on the wire. Platformer is
// omitted — it is expressed through the levelType filter (Level.length is
// 'Platformer' for those rows, but levelType is the canonical flag).
export const LevelLengthSchema = z.enum([
  'tiny',
  'short',
  'medium',
  'long',
  'xl',
])

// Song provenance. official → officialSongId set · custom → Newgrounds song,
// isNong=false · nong → isNong=true (Song File Hub replacement).
export const LevelSongTypeSchema = z.enum(['official', 'custom', 'nong'])

export const LevelTypeFilterSchema = z.enum(['CLASSIC', 'PLATFORMER'])

// Which text column the query string filters on. Creator search is cache-only
// (GD's servers have no fuzzy creator search).
export const LevelSearchBySchema = z.enum(['name', 'creator'])

// Result ordering. 'relevance' requires a query (falls back to downloads with an
// empty query); the rest sort on stored, user-independent columns. 'stars' sorts
// by difficulty face then star count (see browseLevels).
export const LevelSortSchema = z.enum([
  'relevance',
  'likes',
  'downloads',
  'stars',
  'objectCount',
  'recentlyRated',
  'name',
])

// Sort direction override. When omitted, each sort uses its natural direction
// (name → asc, everything else → desc).
export const LevelSortDirSchema = z.enum(['asc', 'desc'])

// The filter set, shared by the cache browse and (where GD's schema permits) the
// RobTop escalation. All optional — an empty object browses the whole cache.
export const LevelSearchFiltersSchema = z.object({
  difficulty: z.array(LevelDifficultySchema).optional(),
  rateStatus: z.array(LevelRateStatusSchema).optional(),
  twoPlayer: z.boolean().optional(),
  coinCount: z.array(z.number().int().min(0).max(3)).optional(),
  coinsVerified: z.boolean().optional(),
  length: z.array(LevelLengthSchema).optional(),
  levelType: LevelTypeFilterSchema.optional(),
  songType: LevelSongTypeSchema.optional(),
})

// Search terms are fed to pg_trgm similarity() and an ILIKE '%…%' over the
// whole levels cache — both linear in the term's length, and neither is
// index-assisted for a pathologically long one. Cap it well above any real
// level or creator name so a single request can't turn into a table-wide scan
// with megabyte-sized comparisons. GET /v1/levels/search parses its own `q`
// and repeats this cap by hand.
export const MAX_SEARCH_QUERY_LENGTH = 200

// The full parsed query for GET /v1/levels/browse (the handler assembles this
// from the raw query params before validating).
export const LevelBrowseQuerySchema = LevelSearchFiltersSchema.extend({
  q: z.string().max(MAX_SEARCH_QUERY_LENGTH).optional(),
  searchBy: LevelSearchBySchema.default('name'),
  sort: LevelSortSchema.default('relevance'),
  sortDir: LevelSortDirSchema.optional(),
  cursor: z.string().optional(),
})

// A results-grid row — the autocomplete row plus the extra user-independent
// columns the grid renders.
export const LevelBrowseResultSchema = LevelSearchResultSchema.extend({
  likes: z.number().int().nullable(),
  downloads: z.number().int().nullable(),
  length: z.string().nullable(),
  coins: z.number().int().nullable(),
  coinsVerified: z.boolean().nullable(),
  twoPlayer: z.boolean().nullable(),
  isDemon: z.boolean(),
  levelType: LevelTypeFilterSchema,
})

// `nextCursor` is an opaque keyset token; null when the last page was returned.
export const LevelBrowseResponseSchema = z.object({
  data: z.array(LevelBrowseResultSchema),
  nextCursor: z.string().nullable(),
})

// The existing-completion summary folded into the resolve response so the
// client can pre-populate the edit form ("edit, not replace").
export const ExistingCompletionSchema = z.object({
  progressUpdateId: z.string().uuid(),
  date: z.coerce.date().nullable(),
  dateTimezone: z.string().nullable(),
  dateUncertain: z.boolean(),
  attempts: z.number().int().nullable(),
  worstFail: z.number().int().nullable(),
  worstFailDate: z.coerce.date().nullable(),
  worstFailDateTimezone: z.string().nullable(),
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable(),
  enjoyment: z.number().int().nullable(),
  fps: z.number().int().nullable(),
  onStream: z.boolean(),
  videoUrl: z.string().nullable(),
  highlightUrl: z.string().nullable(),
  notes: z.string().nullable(),
  visibility: z.nativeEnum(EntryVisibility),
  device: z.nativeEnum(Device).nullable(),
  // LevelProgress fields
  simpleRating: z.number().int().nullable(),
  ratingScores: z.array(
    z.object({ categoryId: z.string().uuid(), score: z.number().int() })
  ),
  coinsCollected: z.number().int().nullable(),
  completionTime: z.number().int().nullable(),
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
  // Resolved server-side, not the raw column: for a non-demon `stars` is
  // canonical and wins over the stored label (deriveInGameDifficulty). Always a
  // face name — "Harder", "Extreme Demon" — so clients rendering just a label
  // need not know which field it came from.
  inGameDifficulty: z.string().nullable(),
  // Awarded star count, and the canonical difficulty identifier for a
  // non-demon: 1-9 there, 10 for a demon, 0/null when unrated. Rendered
  // alongside the face for non-demons ("7★ Harder").
  stars: z.number().int().nullable(),
  isDemon: z.boolean(),
  isRated: z.boolean(),
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
  dateTimezone: z.string().nullable(),
  dateUncertain: z.boolean(),
  attempts: z.number().int().nullable(),
  percentage: z.number().nullable(),
  runFrom: z.number().int().nullable(),
  runTo: z.number().int().nullable(),
  enjoyment: z.number().int().nullable(), // 0–100 internal scale
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable(),
  onStream: z.boolean(),
  fps: z.number().int().nullable(),
  percentageVersion: z.nativeEnum(GdVersion).nullable(),
  videoUrl: z.string().nullable(),
  highlightUrl: z.string().nullable(),
  notes: z.string().nullable(),
  device: z.nativeEnum(Device).nullable(),
  loggedAt: z.coerce.date(),
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
  // Computed at query time (never stored): simpleRating in SIMPLE mode, the
  // weighted average of ratingScores in WEIGHTED mode. 0–100 internal scale.
  // One value per level (LevelProgress), not per logged event.
  overallRating: z.number().nullable(),
  // Per-category scores used for tie-breaking weighted-average sorts and for
  // individual category columns. Only meaningful in WEIGHTED mode.
  ratingScores: z.array(
    z.object({ categoryId: z.string(), score: z.number().int() })
  ),
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

// The four view-config fields are opaque to the API — it stores and returns
// whatever the client sends. "Opaque" cannot mean "unbounded", though: with no
// ceiling, a preset is a write-anything key/value store on the API's own
// database, and a caller can park arbitrary amounts of data there under an
// authenticated account. Bound the serialized size instead of the shape, which
// keeps the fields genuinely opaque while capping what one preset can cost.
// The real configs are a few hundred characters; 64K is far beyond any of them.
export const MAX_PRESET_BLOB_CHARS = 64 * 1024

// Measured in JSON characters rather than encoded bytes: this package targets
// the ES2020 lib alone, so neither Buffer nor TextEncoder is available. A
// character count is within a small constant factor of the byte count, which is
// all a ceiling this loose needs.
const PresetBlobSchema = z.unknown().refine((value) => {
  if (value === undefined) return true
  try {
    return (JSON.stringify(value) ?? '').length <= MAX_PRESET_BLOB_CHARS
  } catch {
    // Circular or otherwise unserializable — it can't be stored as JSON either.
    return false
  }
}, `View configuration must serialize to at most ${MAX_PRESET_BLOB_CHARS} characters`)

export const ListPresetInputSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional().nullable(),
  color: z.enum(PRESET_COLOR_IDS),
  sorts: PresetBlobSchema,
  filters: PresetBlobSchema,
  columns: PresetBlobSchema,
  columnOrder: PresetBlobSchema,
  // Display preference — hides the time-of-day line under the date column.
  // A plain boolean rather than another opaque blob, unlike the four above.
  hideTime: z.boolean().default(false),
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
  hideTime: z.boolean(),
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
  attempts: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_ATTEMPTS)
    .nullable()
    .optional(),
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
  // The non-demon star values (AUTO..NINE_STAR) carry their own star count —
  // no separate paired field.
  difficultyOpinion: z.nativeEnum(DifficultyOpinion).nullable().optional(),
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
  userGddlTier: z
    .number()
    .int()
    .min(0)
    .max(MAX_GDDL_TIER)
    .nullable()
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  videoUrl: HttpUrlSchema.nullable().optional(),
  highlightUrl: HttpUrlSchema.nullable().optional(),
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
  attempts: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_ATTEMPTS)
    .nullable()
    .optional(),
  percentage: z.number().min(0).max(100).nullable().optional(),
  runFrom: z.number().int().min(0).max(100).nullable().optional(),
  runTo: z.number().int().min(0).max(100).nullable().optional(),
  onStream: z.boolean().nullable().optional(),
  fps: z.number().int().positive().max(MAX_FPS).nullable().optional(),
  device: z.nativeEnum(Device).nullable().optional(),
  // 0-10 display scale (server converts to 0-100 on write).
  enjoyment: z.number().min(0).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  highlightUrl: HttpUrlSchema.nullable().optional(),
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
  attemptsAtDrop: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_ATTEMPTS)
    .nullable()
    .optional(),
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
  // category name → score (0-100, internal scale).
  //
  // Category names are matched case-insensitively against the user's existing
  // rating categories and CREATED ON DEMAND when unrecognized (see
  // commitImportRatings). That makes this record the one place in the API where
  // a caller can create rating_categories rows implicitly and in bulk, so the
  // key length is bounded here. How MANY categories may be created is bounded
  // in commitImportRatings instead (it needs the account's existing category
  // count to decide) — the settings editor caps a user at
  // MAX_RATING_CATEGORIES and this must not be the way around that.
  scores: z.record(
    z.string().min(1).max(MAX_RATING_CATEGORY_NAME_LENGTH),
    z.number().int().min(0).max(100)
  ),
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

// ─────────────────────────────────────────────
// ACTIVITY LOG — the Log page feed and the level-page rank history.
// See docs/EVENT_LOG.md → "Surfaces". Both are scoped to the authenticated
// user's own data; activity_log.visibility is inert and there is no public
// equivalent of either.
// ─────────────────────────────────────────────

// Every user-facing event type, mirroring the ActivityEventType enum in
// apps/api/prisma/schema.prisma minus RANKING_REBALANCE — the internal-only
// renormalisation, which is filtered out in the feed query and can never reach
// the wire. It is absent from this package entirely, so a legend or filter list
// built from FEED_EVENT_TYPES cannot leak it by accident.
export const FeedEventTypeSchema = z.enum([
  'RANKING_PLACEMENT',
  'RANKING_REORDER',
  'RANKING_UNRANKED',
  'RANKING_BULK_REPLACE',
  'LOG_EDIT',
  'RATING_CONFIG_CHANGE',
])

export const FEED_EVENT_TYPES = FeedEventTypeSchema.options

// The filter key for field-change rows, mirroring ActivityFieldCategory in
// schema.prisma. The feed's category filter keys off THIS and never off
// fieldName, so a newly editable field only needs a category rather than an
// entry in a hardcoded list on both sides of the wire. See docs/EVENT_LOG.md,
// "Filter on category, never on fieldName".
export const ActivityFieldCategorySchema = z.enum([
  'RATING',
  'SESSION_DETAIL',
  'METADATA',
  'RATING_CONFIG',
])

export const ACTIVITY_FIELD_CATEGORIES = ActivityFieldCategorySchema.options

// Why a level appears on a ranking event: MOVER is the level the user acted on,
// NEIGHBOR one immediately adjacent to it before or after the move.
export const ActivityImpactRoleSchema = z.enum(['MOVER', 'NEIGHBOR'])

// Event logging shipped on this date and history cannot be backfilled — the
// previous values simply were not written down. Every activity surface has a
// hard floor here, and an empty one means "nothing since then", not
// "nothing ever". See docs/EVENT_LOG.md.
export const ACTIVITY_LOG_EPOCH = new Date('2026-08-24T00:00:00.000Z')

/** One field a save changed, as the feed renders it. */
export const ActivityFieldChangeSchema = z.object({
  // Raw snake_case identifier. Per-category weighted scores are
  // `rating_score:<categoryId>` — resolve the id against the user's current
  // categories, and render one that no longer exists as a removed category
  // rather than guessing at a name. Never filter on this; filter on `category`.
  fieldName: z.string(),
  category: ActivityFieldCategorySchema,
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
})

/** One level a ranking event touched. */
export const ActivityLevelImpactSchema = z.object({
  // Null once the level has left the shared cache; `levelName` is the
  // write-time snapshot that keeps such a row readable.
  levelId: z.string().nullable(),
  levelName: z.string().nullable(),
  role: ActivityImpactRoleSchema,
  positionBefore: z.number().int().nullable(),
  positionAfter: z.number().int().nullable(),
  milestoneCrossed: z.number().int().nullable(),
})

// An activity_log row. `recordedAt` is when it was written down, which is what
// the feed orders by — a progress update's user-entered `date` is row content,
// never a sort key.
export const ActivityFeedEventSchema = z.object({
  source: z.literal('EVENT'),
  id: z.string().uuid(),
  recordedAt: z.coerce.date(),
  // The intra-transaction tiebreaker, and the third key of the feed's total
  // order. Echoed back so the client can rebuild a cursor if it needs to.
  sequence: z.number().int(),
  eventType: FeedEventTypeSchema,
  // Null for RATING_CONFIG_CHANGE (account-scoped) and for RANKING_BULK_REPLACE
  // (list-wide — its levels are its impact rows).
  levelId: z.string().nullable(),
  levelName: z.string().nullable(),
  fieldChanges: z.array(ActivityFieldChangeSchema),
  // Capped at ACTIVITY_IMPACT_PREVIEW — a bulk replace can touch the whole
  // ranking. `impactCount` is the true total, so a row can say "42 levels
  // reordered" without the response carrying all 42.
  levelImpacts: z.array(ActivityLevelImpactSchema),
  impactCount: z.number().int(),
})

// A progress_updates row. These are NOT duplicated into activity_log — they are
// already events (kind + loggedAt) and the feed merges the two tables at read
// time. See docs/EVENT_LOG.md, "Deliberately not tracked".
export const ActivityFeedProgressSchema = z.object({
  source: z.literal('PROGRESS'),
  id: z.string().uuid(),
  // `loggedAt` — when the user wrote it down. A back-dated completion therefore
  // sits at the top of the day it was entered, not of the day it happened.
  recordedAt: z.coerce.date(),
  kind: z.nativeEnum(ProgressUpdateKind),
  levelId: z.string(),
  levelName: z.string().nullable(),
  // What the user says happened, and when they say it happened. Row content.
  date: z.coerce.date().nullable(),
  dateTimezone: z.string().nullable(),
  dateUncertain: z.boolean(),
  percentage: z.number().nullable(),
  runFrom: z.number().int().nullable(),
  runTo: z.number().int().nullable(),
  attempts: z.number().int().nullable(),
  enjoyment: z.number().int().nullable(), // 0–100 internal scale
})

export const ActivityFeedItemSchema = z.discriminatedUnion('source', [
  ActivityFeedEventSchema,
  ActivityFeedProgressSchema,
])

/** How many of a ranking event's impact rows one feed item carries. */
export const ACTIVITY_IMPACT_PREVIEW = 10

/** Feed items per page. */
export const ACTIVITY_PAGE_SIZE = 30

// The Log page's filter chips, in the order they are shown. Deliberately NOT
// the event-type enum: the chips are the four things a user recognises having
// done, and one of them ("Progress") is not an activity_log row at all.
//
//   PROGRESS — progress_updates, all three kinds
//   RANKING  — the four visible RANKING_* event types
//   EDITS    — LOG_EDIT, narrowed by field `category` when one is given
//   SETTINGS — RATING_CONFIG_CHANGE
//
// Naming none of them is the "All" chip and means the whole feed.
export const ActivityFeedKindSchema = z.enum([
  'PROGRESS',
  'RANKING',
  'EDITS',
  'SETTINGS',
])

export const ACTIVITY_FEED_KINDS = ActivityFeedKindSchema.options

// The parsed query for GET /v1/me/activity. Every filter is optional; an
// unfiltered request is the whole feed newest-first.
export const ActivityFeedQuerySchema = z.object({
  kind: z.array(ActivityFeedKindSchema).optional(),
  // Narrows the EDITS group to saves that touched one of these categories, and
  // affects nothing else — it is the sub-filter of one chip, not a filter over
  // the whole feed. Keyed off `category` rather than off field names so a newly
  // editable field needs no change on either side of the wire. Passing a
  // category without also passing EDITS is meaningless and ignored.
  category: z.array(ActivityFieldCategorySchema).optional(),
  // A UNION, not a column match: a RANKING_BULK_REPLACE has a null levelId and
  // belongs to every level its impact rows touched, so this matches
  // activity_log.levelId OR activity_log_level_impact.levelId. Without the
  // union an import that moved a level goes missing from that level's history.
  // RATING_CONFIG_CHANGE is account-scoped and drops out by definition — say so
  // in the UI rather than leaving a silent hole.
  levelId: z.string().optional(),
  // Both bounds are on recorded time, the same clock the ordering uses.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().optional(),
})

// `nextCursor` is an opaque keyset token over (recordedAt, source, sequence|id);
// null on the last page.
export const ActivityFeedResponseSchema = z.object({
  data: z.array(ActivityFeedItemSchema),
  nextCursor: z.string().nullable(),
})

// ─── Rank history ───────────────────────────────────────────────────────────

// How a level came to be where it is on one entry of its rank history.
//
//   DIRECT       — the user moved this level, so the event carries its own
//                  impact row and the positions are read straight off it.
//   INDIRECT     — the level shifted because something else moved past it.
//                  Reconstructed: such shifts have no rows of their own (see
//                  docs/RANKING_SYSTEM.md, "direct events only").
//   UNATTRIBUTED — a shift the reconstruction can prove happened but cannot
//                  name a cause for, because the entry that caused it has since
//                  been deleted and took its events with it. The stored
//                  position is trusted over the recomputed one.
export const RankHistoryEntryKindSchema = z.enum([
  'DIRECT',
  'INDIRECT',
  'UNATTRIBUTED',
])

export const RankHistoryEntrySchema = z.object({
  // Stable per entry: the event id, suffixed for the unattributed shift an
  // event can reveal alongside its own move.
  id: z.string(),
  recordedAt: z.coerce.date(),
  kind: RankHistoryEntryKindSchema,
  // Null on an UNATTRIBUTED entry: the shift is real, but it did not happen
  // because of the event that revealed it.
  eventType: FeedEventTypeSchema.nullable(),
  // Null before an initial placement, and after an unranking.
  positionBefore: z.number().int().nullable(),
  positionAfter: z.number().int().nullable(),
  // The tightest top-N boundary crossed, or null. Direction is read off the two
  // positions — entering the top 10 and falling out of it are both `10`.
  milestoneCrossed: z.number().int().nullable(),
  // The level whose move caused an INDIRECT shift, from that event's MOVER row.
  // Always null on DIRECT and UNATTRIBUTED entries.
  cause: z
    .object({
      levelId: z.string().nullable(),
      levelName: z.string().nullable(),
    })
    .nullable(),
  // Levels recorded alongside this one on a DIRECT event — the neighbours the
  // move sat between. Empty for a bulk replace, which has no neighbours.
  neighbors: z.array(ActivityLevelImpactSchema),
  // How many levels a list-wide event touched, for "42 levels reordered".
  levelsTouched: z.number().int().nullable(),
})

export const RankHistoryResponseSchema = z.object({
  // Newest first, the same direction the feed reads.
  data: z.array(RankHistoryEntrySchema),
  // The level's live position in the classic ranking, or null when it is not
  // placed. Read from classic_ranking rather than from the walk, so the panel
  // header states a fact rather than a reconstruction.
  currentPosition: z.number().int().nullable(),
})
