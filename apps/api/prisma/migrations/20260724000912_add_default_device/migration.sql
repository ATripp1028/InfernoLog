-- AlterTable
ALTER TABLE "users" ADD COLUMN     "defaultDevice" "Device" NOT NULL DEFAULT 'pc',
ALTER COLUMN "showHighlightUrl" SET DEFAULT false;
