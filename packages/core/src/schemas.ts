import { z } from 'zod'
import {
  LevelType,
  ListSource,
  LevelProgressStatus,
  RatingMode,
  AccountStatus,
  Role,
  RatingDisplayScale,
  DateFormatPreference,
  EntryVisibility
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