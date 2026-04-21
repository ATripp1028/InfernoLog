export enum Role {
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN'
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED'
}

export enum RatingMode {
  SIMPLE = 'SIMPLE',
  WEIGHTED = 'WEIGHTED'
}

export enum RatingDisplayScale {
  ZERO_TO_TEN = 'ZERO_TO_TEN',
  ZERO_TO_HUNDRED = 'ZERO_TO_HUNDRED'
}

export enum DateFormatPreference {
  MDY = 'MDY',
  DMY = 'DMY',
  YMD = 'YMD',
  ISO = 'ISO'
}

export enum LevelType {
  CLASSIC = 'CLASSIC',
  PLATFORMER = 'PLATFORMER'
}

export enum LevelProgressStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  DROPPED = 'DROPPED',
  COMPLETED = 'COMPLETED'
}

export enum EntryVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE'
}

export enum ListType {
  WANT_TO_BEAT = 'WANT_TO_BEAT',
  FAVORITES = 'FAVORITES',
  LEAST_FAVORITES = 'LEAST_FAVORITES',
  CUSTOM = 'CUSTOM'
}

export enum ListSource {
  GDDL = 'GDDL',
  POINTERCRATE = 'POINTERCRATE',
  AREDL = 'AREDL',
  NLW = 'NLW',
  OTHER = 'OTHER'
}

export enum ReportStatus {
  PENDING = 'PENDING',
  DISMISSED = 'DISMISSED',
  ACTIONED = 'ACTIONED'
}

export enum AppealStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED'
}

export enum ModerationActionType {
  WARN = 'WARN',
  SUSPEND = 'SUSPEND',
  BAN = 'BAN',
  UNBAN = 'UNBAN',
  VERIFY = 'VERIFY',
  UNVERIFY = 'UNVERIFY'
}