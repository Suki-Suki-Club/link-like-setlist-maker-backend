ALTER TABLE "SongMedia"
ADD COLUMN "title" TEXT,
ADD COLUMN "artistName" TEXT,
ADD COLUMN "albumTitle" TEXT,
ADD COLUMN "duration" INTEGER,
ADD COLUMN "coverUrl" TEXT,
ADD COLUMN "previewUrl" TEXT,
ADD COLUMN "trackLink" TEXT,
ADD COLUMN "isrc" TEXT,
ADD COLUMN "rank" INTEGER,
ADD COLUMN "fetchedAt" TIMESTAMP(3);

CREATE INDEX "SongMedia_status_fetchedAt_idx" ON "SongMedia"("status", "fetchedAt");
