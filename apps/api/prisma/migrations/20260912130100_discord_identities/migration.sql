-- AlterTable
ALTER TABLE "auth_identities" ADD COLUMN     "providerAccountId" TEXT,
ALTER COLUMN "cognitoSub" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_providerAccountId_key" ON "auth_identities"("provider", "providerAccountId");

-- An identity with neither key could not be signed in with and would name no
-- external account, so it would mean nothing. Prisma's schema cannot express
-- this; it lives only here.
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_has_key"
    CHECK ("cognitoSub" IS NOT NULL OR "providerAccountId" IS NOT NULL);

-- Backfill: every linked Discord account becomes a DISCORD identity.
--
-- users.discordId stays, still written but no longer read, so that code
-- deployed before this migration keeps working until it is replaced. It is
-- dropped in a later migration. When each link was made was never recorded,
-- so createdAt is the time of this backfill.
INSERT INTO "auth_identities" ("id", "userId", "provider", "providerAccountId", "createdAt")
SELECT gen_random_uuid()::text, "id", 'DISCORD'::"AuthProvider", "discordId", CURRENT_TIMESTAMP
FROM "users"
WHERE "discordId" IS NOT NULL;
