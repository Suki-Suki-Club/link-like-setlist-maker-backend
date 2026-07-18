-- Fold SetlistItem rows into Setlist.songIds, add content-hash dedup and TTL bookkeeping.

-- AlterTable
ALTER TABLE "Setlist"
  ADD COLUMN "songIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill songIds from existing SetlistItem rows, preserving position order.
UPDATE "Setlist" s
SET "songIds" = COALESCE(
  (
    SELECT array_agg(i."songId" ORDER BY i."position")
    FROM "SetlistItem" i
    WHERE i."setlistId" = s."id"
  ),
  ARRAY[]::TEXT[]
);

-- Existing rows keep contentHash NULL (Postgres unique indexes allow multiple NULLs),
-- so dedup only applies to setlists created after this migration.
CREATE UNIQUE INDEX "Setlist_contentHash_key" ON "Setlist"("contentHash");

-- CreateIndex (used by the pg_cron TTL cleanup job)
CREATE INDEX "Setlist_lastAccessedAt_idx" ON "Setlist"("lastAccessedAt");

-- DropTable
DROP TABLE "SetlistItem";
