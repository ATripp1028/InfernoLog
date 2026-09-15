-- ⚠️ CREDENTIALS — emailed verification codes, stored only as an HMAC.
-- See the EmailVerification model in schema.prisma and CLAUDE.md
-- "Credential handling".


-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('SIGNUP', 'EMAIL_CHANGE', 'PASSWORD_SETUP');

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "requesterIpHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verifications_purpose_email_createdAt_idx" ON "email_verifications"("purpose", "email", "createdAt");

-- CreateIndex
CREATE INDEX "email_verifications_requesterIpHash_createdAt_idx" ON "email_verifications"("requesterIpHash", "createdAt");

-- CreateIndex
CREATE INDEX "email_verifications_userId_purpose_idx" ON "email_verifications"("userId", "purpose");

-- CreateIndex
CREATE INDEX "email_verifications_createdAt_idx" ON "email_verifications"("createdAt");

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

