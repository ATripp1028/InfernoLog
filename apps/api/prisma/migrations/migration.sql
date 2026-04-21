-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "RatingMode" AS ENUM ('SIMPLE', 'WEIGHTED');

-- CreateEnum
CREATE TYPE "DateFormatPreference" AS ENUM ('MDY', 'DMY', 'YMD', 'ISO');

-- CreateEnum
CREATE TYPE "LevelType" AS ENUM ('CLASSIC', 'PLATFORMER');

-- CreateEnum
CREATE TYPE "LevelProgressStatus" AS ENUM ('IN_PROGRESS', 'DROPPED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EntryVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ListType" AS ENUM ('WANT_TO_BEAT', 'FAVORITES', 'LEAST_FAVORITES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ListSource" AS ENUM ('GDDL', 'POINTERCRATE', 'AREDL', 'NLW', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('WARN', 'SUSPEND', 'BAN', 'UNBAN', 'VERIFY', 'UNVERIFY');

-- CreateEnum
CREATE TYPE "RatingDisplayScale" AS ENUM ('ZERO_TO_TEN', 'ZERO_TO_HUNDRED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameChangedAt" TIMESTAMP(3),
    "previousUsername" TEXT,
    "email" TEXT NOT NULL,
    "discordId" TEXT,
    "googleId" TEXT,
    "profilePublic" BOOLEAN NOT NULL DEFAULT true,
    "discordPublic" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspensionUntil" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "gddlApiKeyEncrypted" TEXT,
    "ratingMode" "RatingMode" NOT NULL DEFAULT 'SIMPLE',
    "listPriorityOrder" "ListSource"[] DEFAULT ARRAY['GDDL', 'AREDL', 'POINTERCRATE', 'NLW', 'OTHER']::"ListSource"[],
    "progressNudgeDays" INTEGER NOT NULL DEFAULT 2,
    "timeMachineTopN" INTEGER NOT NULL DEFAULT 10,
    "dateFormatPreference" "DateFormatPreference" NOT NULL DEFAULT 'MDY',
    "ratingDisplayScale" "RatingDisplayScale" NOT NULL DEFAULT 'ZERO_TO_TEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "inGameId" TEXT NOT NULL,
    "levelType" "LevelType" NOT NULL DEFAULT 'CLASSIC',
    "isRated" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "creator" TEXT,
    "songName" TEXT,
    "songAuthor" TEXT,
    "isNong" BOOLEAN NOT NULL DEFAULT false,
    "nongSongTitle" TEXT,
    "nongArtist" TEXT,
    "nongSourceUrl" TEXT,
    "peakMusicBpm" INTEGER,
    "dataSource" TEXT NOT NULL DEFAULT 'manual',
    "lastCheckedAt" TIMESTAMP(3),
    "hasPendingUpdate" BOOLEAN NOT NULL DEFAULT false,
    "pendingName" TEXT,
    "pendingCreator" TEXT,
    "pendingSongName" TEXT,
    "pendingSongAuthor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("inGameId")
);

-- CreateTable
CREATE TABLE "level_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "status" "LevelProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "droppedReason" TEXT,
    "droppedAt" TIMESTAMP(3),
    "visibility" "EntryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_updates" (
    "id" TEXT NOT NULL,
    "levelProgressId" TEXT NOT NULL,
    "isCompletion" BOOLEAN NOT NULL DEFAULT false,
    "percentage" DECIMAL(5,2),
    "runFrom" INTEGER,
    "runTo" INTEGER,
    "completionTime" INTEGER,
    "attempts" INTEGER,
    "date" DATE,
    "dateUncertain" BOOLEAN NOT NULL DEFAULT false,
    "onStream" BOOLEAN NOT NULL DEFAULT false,
    "fps" INTEGER,
    "peakHeartRateBpm" INTEGER,
    "enjoyment" INTEGER,
    "simpleRating" INTEGER,
    "inGameDifficulty" TEXT,
    "notes" TEXT,
    "videoUrl" TEXT,
    "highlightUrl" TEXT,
    "top5AtTime" BOOLEAN NOT NULL DEFAULT false,
    "top5Position" INTEGER,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "list_references" (
    "id" TEXT NOT NULL,
    "progressUpdateId" TEXT NOT NULL,
    "listSource" "ListSource" NOT NULL,
    "tierOrRank" TEXT NOT NULL,
    "atTimeOfLogging" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_acceptances" (
    "id" TEXT NOT NULL,
    "progressUpdateId" TEXT NOT NULL,
    "listSource" "ListSource" NOT NULL,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "record_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "includeEnjoyment" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_scores" (
    "id" TEXT NOT NULL,
    "progressUpdateId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "rating_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classic_ranking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelProgressId" TEXT NOT NULL,
    "rankingIndex" DECIMAL(20,10) NOT NULL,

    CONSTRAINT "classic_ranking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_lists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ListType" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_list_entries" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_update_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_update_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_nudges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelProgressId" TEXT NOT NULL,
    "lastNudgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_nudges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "assignedModeratorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ban_appeals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appealText" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ban_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" "ModerationActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "durationHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_discordId_key" ON "users"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "level_progress_userId_levelId_key" ON "level_progress"("userId", "levelId");

-- CreateIndex
CREATE UNIQUE INDEX "record_acceptances_progressUpdateId_listSource_key" ON "record_acceptances"("progressUpdateId", "listSource");

-- CreateIndex
CREATE UNIQUE INDEX "rating_scores_progressUpdateId_categoryId_key" ON "rating_scores"("progressUpdateId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "classic_ranking_levelProgressId_key" ON "classic_ranking"("levelProgressId");

-- CreateIndex
CREATE UNIQUE INDEX "level_list_entries_listId_levelId_key" ON "level_list_entries"("listId", "levelId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "progress_nudges_levelProgressId_key" ON "progress_nudges"("levelProgressId");

-- AddForeignKey
ALTER TABLE "level_progress" ADD CONSTRAINT "level_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_progress" ADD CONSTRAINT "level_progress_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("inGameId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_levelProgressId_fkey" FOREIGN KEY ("levelProgressId") REFERENCES "level_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_references" ADD CONSTRAINT "list_references_progressUpdateId_fkey" FOREIGN KEY ("progressUpdateId") REFERENCES "progress_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_acceptances" ADD CONSTRAINT "record_acceptances_progressUpdateId_fkey" FOREIGN KEY ("progressUpdateId") REFERENCES "progress_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_categories" ADD CONSTRAINT "rating_categories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_scores" ADD CONSTRAINT "rating_scores_progressUpdateId_fkey" FOREIGN KEY ("progressUpdateId") REFERENCES "progress_updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_scores" ADD CONSTRAINT "rating_scores_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "rating_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classic_ranking" ADD CONSTRAINT "classic_ranking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classic_ranking" ADD CONSTRAINT "classic_ranking_levelProgressId_fkey" FOREIGN KEY ("levelProgressId") REFERENCES "level_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lists" ADD CONSTRAINT "user_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_list_entries" ADD CONSTRAINT "level_list_entries_listId_fkey" FOREIGN KEY ("listId") REFERENCES "user_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_list_entries" ADD CONSTRAINT "level_list_entries_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("inGameId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_update_notifications" ADD CONSTRAINT "level_update_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_update_notifications" ADD CONSTRAINT "level_update_notifications_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("inGameId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_nudges" ADD CONSTRAINT "progress_nudges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_nudges" ADD CONSTRAINT "progress_nudges_levelProgressId_fkey" FOREIGN KEY ("levelProgressId") REFERENCES "level_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assignedModeratorId_fkey" FOREIGN KEY ("assignedModeratorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ban_appeals" ADD CONSTRAINT "ban_appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ban_appeals" ADD CONSTRAINT "ban_appeals_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
