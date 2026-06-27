-- Level Page: add level_notes to level_progress.
-- This is a per-user-per-level "about this level overall" text field, distinct
-- from progress_updates.notes (per-completion notes). It survives edits or
-- deletions of individual progress_update rows. See DATA_MODEL.md.

-- AlterTable
ALTER TABLE "level_progress" ADD COLUMN "levelNotes" TEXT;
