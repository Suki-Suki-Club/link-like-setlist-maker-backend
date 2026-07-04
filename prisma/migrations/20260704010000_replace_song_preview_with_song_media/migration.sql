CREATE TABLE "SongMedia" (
    "songId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deezerTrackId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongMedia_pkey" PRIMARY KEY ("songId")
);

INSERT INTO "SongMedia" ("songId", "status", "deezerTrackId", "createdAt", "updatedAt")
SELECT
    "id",
    CASE WHEN "deezerTrackId" IS NULL THEN 'unavailable' ELSE 'available' END,
    "deezerTrackId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Song"
ON CONFLICT ("songId") DO NOTHING;

CREATE INDEX "SongMedia_status_idx" ON "SongMedia"("status");
CREATE INDEX "SongMedia_deezerTrackId_idx" ON "SongMedia"("deezerTrackId");

ALTER TABLE "SongMedia" ADD CONSTRAINT "SongMedia_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE IF EXISTS "SongPreview";

DROP INDEX IF EXISTS "Song_deezerTrackId_idx";
ALTER TABLE "Song" DROP COLUMN IF EXISTS "deezerSearchTitle";
ALTER TABLE "Song" DROP COLUMN IF EXISTS "deezerArtistName";
ALTER TABLE "Song" DROP COLUMN IF EXISTS "deezerArtistId";
ALTER TABLE "Song" DROP COLUMN IF EXISTS "deezerTrackId";
