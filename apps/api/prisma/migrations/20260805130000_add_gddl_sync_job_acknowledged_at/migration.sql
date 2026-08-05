-- Adds acknowledgedAt to gddl_sync_jobs so the server can track per-run "has
-- the client shown this completion" state. GddlSyncJob's id is stable per
-- user for the life of their account (see the model's schema comment), so
-- it can't be used to distinguish one sync run's completion from the next —
-- acknowledgedAt is reset to NULL whenever a new sync starts and set once
-- the client has shown the result.
ALTER TABLE "gddl_sync_jobs" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
