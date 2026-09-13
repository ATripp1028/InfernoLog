-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'PASSWORD');

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "cognitoSub" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_cognitoSub_key" ON "auth_identities"("cognitoSub");

-- CreateIndex
CREATE INDEX "auth_identities_userId_idx" ON "auth_identities"("userId");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one identity for every account that already has a Cognito sub.
--
-- Every such account signed up through Google, except the E2E user, which is a
-- native password identity (scripts/provisionE2eUser.ts). That one is told
-- apart by its "e2e+" email prefix, which scripts/e2eFixtures.ts requires of
-- the E2E address. A real address could start with "e2e+" as well; the cost of
-- that is a mislabelled provider, which nothing reads yet. Re-running
-- `pnpm e2e:provision` rewrites the E2E user's identity in any case.
--
-- The id is generated here because @default(uuid()) is applied by Prisma
-- Client, not by the database.
INSERT INTO "auth_identities" ("id", "userId", "provider", "cognitoSub", "email", "createdAt")
SELECT
    gen_random_uuid()::text,
    "id",
    CASE
        WHEN "email" LIKE 'e2e+%' THEN 'PASSWORD'::"AuthProvider"
        ELSE 'GOOGLE'::"AuthProvider"
    END,
    "cognitoSub",
    "email",
    "createdAt"
FROM "users"
WHERE "cognitoSub" IS NOT NULL;
