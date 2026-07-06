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

// The user's subjective difficulty read on a completion. NOT_DEMON_WORTHY is a
// disagreement flag only — the level stays a rated demon. Distinct from the
// level's cached in-game difficulty. See DATA_MODEL.md / LOGGING_FLOW.md.
export enum DifficultyOpinion {
  NOT_DEMON_WORTHY = 'NOT_DEMON_WORTHY',
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

export enum ListSource {
  GDDL = 'GDDL',
  AREDL = 'AREDL',
  NLW = 'NLW',
  OTHER = 'OTHER',
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
