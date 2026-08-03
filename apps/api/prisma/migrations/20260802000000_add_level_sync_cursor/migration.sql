-- CreateTable
CREATE TABLE "level_sync_cursor" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastInGameId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_sync_cursor_pkey" PRIMARY KEY ("id")
);
