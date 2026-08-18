-- Per-user RobTop call budget. See the RobtopUserBudget model in schema.prisma
-- and apps/api/src/utils/robtopUserBudget.ts.
--
-- Rows are created lazily on a user's first charge, so no backfill is needed:
-- an absent row means "full budget", which is what the INSERT ... ON CONFLICT
-- in chargeRobtopBudget relies on.

-- CreateTable
CREATE TABLE "robtop_user_budget" (
    "userId" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "lastRefillAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "robtop_user_budget_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "robtop_user_budget" ADD CONSTRAINT "robtop_user_budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
