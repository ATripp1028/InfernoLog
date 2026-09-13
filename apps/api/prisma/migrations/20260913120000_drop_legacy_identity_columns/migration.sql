-- Drops the two columns AuthIdentity replaced: users.cognitoSub (now a sign-in
-- identity's cognitoSub) and users.discordId (now a DISCORD identity's
-- providerAccountId). Both were backfilled into auth_identities by earlier
-- migrations and have been read by nothing since.
--
-- Apply only AFTER deploying the code that stopped writing them. The previous
-- release still writes both, and Prisma selects every column of a row it
-- creates or updates without a `select`, so that release fails against a table
-- without them.

-- DropIndex
DROP INDEX "users_discordId_key";

-- DropIndex
DROP INDEX "users_cognitoSub_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "cognitoSub",
DROP COLUMN "discordId";
