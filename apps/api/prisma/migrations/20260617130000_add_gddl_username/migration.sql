-- Persist the GDDL account name confirmed at key-verification time so the
-- connected-accounts UI can display it on load (the encrypted key itself is
-- never returned to the client).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "gddlUsername" TEXT;
