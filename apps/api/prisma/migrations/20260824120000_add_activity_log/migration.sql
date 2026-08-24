-- Event logging: the activity_log parent table plus its two child tables.
-- See the ActivityLog / ActivityLogLevelImpact / ActivityLogFieldChange models
-- in schema.prisma, docs/EVENT_LOG.md for the taxonomy, and
-- apps/api/src/services/activityLog for the emission API.
--
-- No backfill. Every row here records a mutation as it happens, and there is
-- no way to reconstruct pre-existing ranking moves, edits or rating-config
-- saves after the fact — history starts at this migration. That is also why
-- emission has to be wired into EVERY write path that touches
-- classic_ranking.rankingIndex from here on: a later gap is just as
-- unrecoverable as this initial one.
--
-- "sequence" is a SERIAL tiebreaker, not decoration. One request routinely
-- writes two events (a placement that trips a rebalance), and createdAt cannot
-- separate them reliably: Prisma stamps it per statement, so the two are a
-- millisecond apart at best, and the column DEFAULT is CURRENT_TIMESTAMP,
-- which Postgres freezes at transaction start for anything inserted by raw
-- SQL. Order by (createdAt, sequence).

-- CreateEnum
CREATE TYPE "ActivityEventType" AS ENUM ('RANKING_PLACEMENT', 'RANKING_REORDER', 'RANKING_UNRANKED', 'RANKING_REBALANCE', 'LOG_EDIT', 'RATING_CONFIG_CHANGE');

-- CreateEnum
CREATE TYPE "ActivityImpactRole" AS ENUM ('MOVER', 'NEIGHBOR');

-- CreateEnum
CREATE TYPE "ActivityFieldCategory" AS ENUM ('RATING', 'SESSION_DETAIL', 'METADATA', 'RATING_CONFIG');

-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "ActivityEventType" NOT NULL,
    "levelId" TEXT,
    "visibility" "EntryVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" SERIAL NOT NULL,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log_level_impact" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "levelId" TEXT,
    "levelName" TEXT,
    "role" "ActivityImpactRole" NOT NULL,
    "rankingIndex" DECIMAL(20,10) NOT NULL,
    "positionBefore" INTEGER,
    "positionAfter" INTEGER,
    "milestoneCrossed" INTEGER,

    CONSTRAINT "activity_log_level_impact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log_field_change" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "category" "ActivityFieldCategory" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,

    CONSTRAINT "activity_log_field_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_log_userId_createdAt_idx" ON "activity_log"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_log_userId_levelId_createdAt_idx" ON "activity_log"("userId", "levelId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_log_level_impact_eventId_idx" ON "activity_log_level_impact"("eventId");

-- CreateIndex
CREATE INDEX "activity_log_level_impact_levelId_idx" ON "activity_log_level_impact"("levelId");

-- CreateIndex
CREATE INDEX "activity_log_field_change_eventId_idx" ON "activity_log_field_change"("eventId");

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("inGameId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log_level_impact" ADD CONSTRAINT "activity_log_level_impact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "activity_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log_level_impact" ADD CONSTRAINT "activity_log_level_impact_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("inGameId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_log_field_change" ADD CONSTRAINT "activity_log_field_change_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "activity_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;
