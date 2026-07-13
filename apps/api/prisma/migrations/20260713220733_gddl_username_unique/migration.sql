-- Prevent multiple InfernoLog accounts from linking the same GDDL account.
-- CreateIndex
CREATE UNIQUE INDEX "users_gddlUsername_key" ON "users"("gddlUsername");
