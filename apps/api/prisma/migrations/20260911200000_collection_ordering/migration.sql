-- CreateEnum
CREATE TYPE "CollectionOrdering" AS ENUM ('ORDERED', 'UNORDERED');

-- AlterTable
ALTER TABLE "collections" ADD COLUMN     "ordering" "CollectionOrdering" NOT NULL DEFAULT 'ORDERED';

-- Want to Beat is a backlog, not a ranking: every existing one becomes
-- unordered. Its entries keep their rankingIndex, which nothing reads as an
-- order any more.
UPDATE "collections" SET "ordering" = 'UNORDERED' WHERE "type" = 'WANT_TO_BEAT';
