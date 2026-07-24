export enum Role {
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

export enum RatingMode {
  SIMPLE = 'SIMPLE',
  WEIGHTED = 'WEIGHTED',
}

export enum RatingDisplayScale {
  ZERO_TO_TEN = 'ZERO_TO_TEN',
  ZERO_TO_HUNDRED = 'ZERO_TO_HUNDRED',
}

export enum DateFormatPreference {
  MDY = 'MDY',
  DMY = 'DMY',
  YMD = 'YMD',
  ISO = 'ISO',
}

export enum LevelType {
  CLASSIC = 'CLASSIC',
  PLATFORMER = 'PLATFORMER',
}

export enum LevelProgressStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  DROPPED = 'DROPPED',
  COMPLETED = 'COMPLETED',
}

// What a ProgressUpdate row represents. Order matters: PROGRESS and DROP are
// declared before COMPLETION so that `orderBy: { kind: 'desc' }` (Postgres
// native enums sort by declaration order) puts a completion first regardless
// of loggedAt — the "representative update" query's replacement for the old
// `isCompletion desc` sort.
export enum ProgressUpdateKind {
  PROGRESS = 'PROGRESS',
  DROP = 'DROP',
  COMPLETION = 'COMPLETION',
}

// The user's subjective difficulty read on a completion. The non-demon star
// values (AUTO..NINE_STAR) are a disagreement flag only — the level stays a
// rated demon. Distinct from the level's cached in-game difficulty. See
// LOGGING_FLOW.md and the DifficultyOpinion enum in apps/api/prisma/schema.prisma.
export enum DifficultyOpinion {
  AUTO = 'AUTO',
  TWO_STAR = 'TWO_STAR',
  THREE_STAR = 'THREE_STAR',
  FOUR_STAR = 'FOUR_STAR',
  FIVE_STAR = 'FIVE_STAR',
  SIX_STAR = 'SIX_STAR',
  SEVEN_STAR = 'SEVEN_STAR',
  EIGHT_STAR = 'EIGHT_STAR',
  NINE_STAR = 'NINE_STAR',
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
  INSANE = 'INSANE',
  EXTREME = 'EXTREME',
}

export enum EntryVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

export enum CollectionType {
  WANT_TO_BEAT = 'WANT_TO_BEAT',
  FAVORITES = 'FAVORITES',
  LEAST_FAVORITES = 'LEAST_FAVORITES',
  CUSTOM = 'CUSTOM',
}

export enum Device {
  PC = 'pc',
  MOBILE = 'mobile',
}

// GD 2.1 measured percentage by distance to the endwall (speed-dependent).
// GD 2.2 reworked to time-based: 100% = duration of the verification attempt.
export enum GdVersion {
  TWO_ONE = 'TWO_ONE',
  TWO_TWO = 'TWO_TWO',
}

export enum ReportStatus {
  PENDING = 'PENDING',
  DISMISSED = 'DISMISSED',
  ACTIONED = 'ACTIONED',
}

export enum AppealStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
}

export enum ModerationActionType {
  WARN = 'WARN',
  SUSPEND = 'SUSPEND',
  BAN = 'BAN',
  UNBAN = 'UNBAN',
  VERIFY = 'VERIFY',
  UNVERIFY = 'UNVERIFY',
}
