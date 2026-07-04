-- Rename the user-owned list grouping concept to "collections":
--   user_lists         → collections
--   level_list_entries → collection_entries
--   listId             → collectionId
--   position (INTEGER) → rankingIndex (DECIMAL(20,10) fractional index)
--
-- Community difficulty-list references (list_references / ListSource) are a
-- different concept and are intentionally untouched.

-- Enum type: values are unchanged, only the type name moves.
ALTER TYPE "ListType" RENAME TO "CollectionType";

-- Tables + FK column.
ALTER TABLE "user_lists" RENAME TO "collections";
ALTER TABLE "level_list_entries" RENAME TO "collection_entries";
ALTER TABLE "collection_entries" RENAME COLUMN "listId" TO "collectionId";

-- position → rankingIndex, seeded 1.0, 2.0, … per collection in the old
-- position order (matching classic_ranking's Decimal(20,10) fractional index).
ALTER TABLE "collection_entries" ADD COLUMN "rankingIndex" DECIMAL(20,10);
UPDATE "collection_entries" ce
SET "rankingIndex" = sub.rn
FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
               PARTITION BY "collectionId"
               ORDER BY "position" ASC, "addedAt" ASC
           ) AS rn
    FROM "collection_entries"
) sub
WHERE ce."id" = sub."id";
ALTER TABLE "collection_entries" ALTER COLUMN "rankingIndex" SET NOT NULL;
ALTER TABLE "collection_entries" DROP COLUMN "position";

-- Rename constraints/indexes to the names Prisma expects for the new tables.
ALTER INDEX "user_lists_pkey" RENAME TO "collections_pkey";
ALTER INDEX "level_list_entries_pkey" RENAME TO "collection_entries_pkey";
ALTER INDEX "level_list_entries_listId_levelId_key" RENAME TO "collection_entries_collectionId_levelId_key";
ALTER TABLE "collections" RENAME CONSTRAINT "user_lists_userId_fkey" TO "collections_userId_fkey";
ALTER TABLE "collection_entries" RENAME CONSTRAINT "level_list_entries_listId_fkey" TO "collection_entries_collectionId_fkey";
ALTER TABLE "collection_entries" RENAME CONSTRAINT "level_list_entries_levelId_fkey" TO "collection_entries_levelId_fkey";
