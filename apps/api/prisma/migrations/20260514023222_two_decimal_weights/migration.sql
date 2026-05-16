-- Drop weight precision from 4 decimals to 2: the UI now restricts users
-- to 2-decimal weights and distributes any 1/N remainder to the top
-- priority item rather than chasing 4-digit precision.
--
-- Existing 4-decimal values round on ALTER COLUMN; any user whose stored
-- sum drifts below 1.00 sees an invalid-sum warning on next visit and
-- re-saves via the editor.
--
-- Adds User.enjoymentSortOrder so enjoyment participates in the unified
-- priority list alongside categories. Default 99 keeps it at the end of
-- any reasonable list on first enable; explicit drags overwrite.

-- AlterTable
ALTER TABLE "rating_categories" ALTER COLUMN "weight" SET DATA TYPE DECIMAL(5,2);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "enjoymentSortOrder" INTEGER NOT NULL DEFAULT 99,
ALTER COLUMN "enjoymentWeight" SET DATA TYPE DECIMAL(5,2);
