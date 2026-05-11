-- Rename column to reflect what it actually stores (Cognito user pool sub, not a Google ID)
ALTER TABLE "users" RENAME COLUMN "googleId" TO "cognitoSub";

-- Rename the unique index to match
ALTER INDEX "users_googleId_key" RENAME TO "users_cognitoSub_key";
