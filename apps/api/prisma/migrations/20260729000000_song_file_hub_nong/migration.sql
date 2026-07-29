-- AlterTable
ALTER TABLE "levels" DROP COLUMN "nongArtist",
DROP COLUMN "nongSongTitle",
DROP COLUMN "nongSourceUrl",
ADD COLUMN     "sfhCheckedAt" TIMESTAMP(3),
ADD COLUMN     "sfhDownloadUrl" TEXT,
ADD COLUMN     "sfhDownloads" INTEGER,
ADD COLUMN     "sfhFileType" TEXT,
ADD COLUMN     "sfhId" TEXT,
ADD COLUMN     "sfhSongId" TEXT,
ADD COLUMN     "sfhSongName" TEXT,
ADD COLUMN     "sfhYoutubeUrl" TEXT,
ADD COLUMN     "sfhYoutubeVideoId" TEXT;

