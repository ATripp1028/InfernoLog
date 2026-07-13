-- Existing import_job_rows/import_jobs predate the new background-job model
-- (they only ever tracked (jobId, rowIndex) pairs for client-batch
-- idempotency) and have no rawData to backfill. Per product spec there is no
-- import history feature — only "one active job per user" — so it's safe to
-- clear this transient tracking data rather than backfill it.
DELETE FROM "import_job_rows";
DELETE FROM "import_jobs";

-- AlterTable
ALTER TABLE "import_job_rows" DROP COLUMN "reason",
ADD COLUMN     "identifier" TEXT,
ADD COLUMN     "issueMessage" TEXT,
ADD COLUMN     "levelName" TEXT,
ADD COLUMN     "rawData" JSONB NOT NULL,
ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN     "collectionsPayload" JSONB,
ADD COLUMN     "collectionsResult" JSONB,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "processedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rankingPayload" JSONB,
ADD COLUMN     "rankingResult" JSONB,
ADD COLUMN     "ratingsPayload" JSONB,
ADD COLUMN     "ratingsResult" JSONB,
ADD COLUMN     "reinvokeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'running',
ADD COLUMN     "totalRows" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "legalAcceptedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_userId_key" ON "import_jobs"("userId");

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
