-- CreateTable
CREATE TABLE "list_presets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL,
    "sorts" JSONB NOT NULL,
    "filters" JSONB NOT NULL,
    "columns" JSONB NOT NULL,
    "columnOrder" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "list_presets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "list_presets" ADD CONSTRAINT "list_presets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
