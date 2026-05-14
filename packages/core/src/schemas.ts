import { z } from 'zod'
import {
  LevelType,
  ListSource,
  RatingMode,
  Role,
  RatingDisplayScale,
  DateFormatPreference
} from './enums'

export const LevelSchema = z.object({
  inGameId: z.string(),
  levelType: z.nativeEnum(LevelType),
  isRated: z.boolean(),
  name: z.string().nullable(),
  creator: z.string().nullable(),
  songName: z.string().nullable(),
  songAuthor: z.string().nullable(),
  isNong: z.boolean(),
  nongSongTitle: z.string().nullable(),
  nongArtist: z.string().nullable(),
  nongSourceUrl: z.string().url().nullable(),
  peakMusicBpm: z.number().int().nullable(),
  dataSource: z.string(),
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
    (val) => !(USERNAME_RESERVED as readonly string[]).includes(val.toLowerCase()),
    'This username is reserved'
  )

export const UpdateUsernameSchema = z.object({
  username: UsernameSchema,
})

export const UpdateMeSchema = z
  .object({
    profilePublic: z.boolean().optional(),
    discordPublic: z.boolean().optional(),
    dateFormatPreference: z.nativeEnum(DateFormatPreference).optional(),
    ratingMode: z.nativeEnum(RatingMode).optional(),
    ratingDisplayScale: z.nativeEnum(RatingDisplayScale).optional(),
    includeEnjoyment: z.boolean().optional(),
    enjoymentWeight: z.number().min(0).max(100).optional(),
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
      cfg.categories.reduce(
        (acc, c) => acc + Math.round(c.weight * 100),
        0
      ) + (cfg.includeEnjoyment ? Math.round(cfg.enjoymentWeight * 100) : 0)
    if (cents !== RATING_WEIGHT_SUM_TARGET_CENTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Active weights must sum to 1.00 (got ${(cents / 100).toFixed(2)})`,
        path: ['categories'],
      })
    }
  })

// Permutation of every ListSource value — order represents priority.
export const ListPriorityOrderSchema = z.object({
  order: z.array(z.nativeEnum(ListSource)).superRefine((arr, ctx) => {
    const expected = Object.values(ListSource) as string[]
    if (arr.length !== expected.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Expected ${expected.length} sources, got ${arr.length}`,
      })
      return
    }
    const seen = new Set<string>()
    for (const v of arr) {
      if (seen.has(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate: ${v}` })
        return
      }
      seen.add(v)
    }
    for (const v of expected) {
      if (!seen.has(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Missing: ${v}` })
        return
      }
    }
  }),
})