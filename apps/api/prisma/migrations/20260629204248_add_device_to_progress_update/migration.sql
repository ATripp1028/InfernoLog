-- CreateEnum
CREATE TYPE "Device" AS ENUM ('pc', 'mobile');

-- AlterTable
ALTER TABLE "progress_updates" ADD COLUMN     "device" "Device";
