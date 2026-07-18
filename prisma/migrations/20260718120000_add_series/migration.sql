-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- Seed the five series up front so the NOT NULL backfill below can reference them
INSERT INTO "Series" ("id", "name", "sortOrder", "updatedAt") VALUES
  ('muse', 'μ''s', 1, CURRENT_TIMESTAMP),
  ('aqours', 'Aqours', 2, CURRENT_TIMESTAMP),
  ('nijigasaki', '虹ヶ咲学園スクールアイドル同好会', 3, CURRENT_TIMESTAMP),
  ('liella', 'Liella!', 4, CURRENT_TIMESTAMP),
  ('hasunosora', '蓮ノ空女学院スクールアイドルクラブ', 5, CURRENT_TIMESTAMP);

-- AlterTable: every existing unit belongs to 蓮ノ空
ALTER TABLE "Unit" ADD COLUMN "seriesId" TEXT NOT NULL DEFAULT 'hasunosora';
ALTER TABLE "Unit" ALTER COLUMN "seriesId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Unit_seriesId_idx" ON "Unit"("seriesId");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
