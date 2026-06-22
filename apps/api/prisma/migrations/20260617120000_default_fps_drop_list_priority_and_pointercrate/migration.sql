-- Log Level prep:
--   1. Add User.defaultFps (pre-fills the Log Level form). Defaults to 60.
--   2. Drop User.listPriorityOrder — autoplacement was cut, so list priority
--      is no longer meaningful.
--   3. Remove POINTERCRATE from the ListSource enum — Pointercrate support was
--      cut. Any existing references to it are dropped first so the enum
--      recreation cast cannot fail.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "defaultFps" INTEGER NOT NULL DEFAULT 60;

-- AlterTable: drop the array column before recreating the enum it referenced.
ALTER TABLE "users" DROP COLUMN "listPriorityOrder";

-- Remove rows pinned to the cut Pointercrate source so the enum cast below
-- has no invalid values to convert.
DELETE FROM "list_references" WHERE "listSource" = 'POINTERCRATE';
DELETE FROM "record_acceptances" WHERE "listSource" = 'POINTERCRATE';

-- AlterEnum: recreate ListSource without POINTERCRATE.
BEGIN;
CREATE TYPE "ListSource_new" AS ENUM ('GDDL', 'AREDL', 'NLW', 'OTHER');
ALTER TABLE "list_references" ALTER COLUMN "listSource" TYPE "ListSource_new" USING ("listSource"::text::"ListSource_new");
ALTER TABLE "record_acceptances" ALTER COLUMN "listSource" TYPE "ListSource_new" USING ("listSource"::text::"ListSource_new");
ALTER TYPE "ListSource" RENAME TO "ListSource_old";
ALTER TYPE "ListSource_new" RENAME TO "ListSource";
DROP TYPE "ListSource_old";
COMMIT;
