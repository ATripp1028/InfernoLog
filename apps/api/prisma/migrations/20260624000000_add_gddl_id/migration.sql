-- AlterTable
ALTER TABLE "users" ADD COLUMN "gddlId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_gddlId_key" ON "users"("gddlId");
