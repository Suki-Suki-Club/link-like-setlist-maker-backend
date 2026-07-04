import { setTimeout as sleep } from "node:timers/promises";
import { getDeezerTrack } from "../src/clients/deezerClient.js";
import { prisma } from "../src/db/client.js";
import {
  findSongMediaNeedingRefresh,
  upsertSongMediaDetails
} from "../src/repositories/songMediaRepository.js";
import {
  songMediaDetailsFreshnessMs,
  songMediaPayloadFromDeezerTrack
} from "../src/services/songMediaService.js";

// Run this outside request handling, for example from a Cloudflare Cron-triggered job
// or a manually triggered CI workflow. It intentionally keeps Deezer concurrency low.
const concurrency = readPositiveInteger("SONG_MEDIA_BACKFILL_CONCURRENCY", 3, 5);
const limit = readPositiveInteger("SONG_MEDIA_BACKFILL_LIMIT", 100);
const maxAttempts = readPositiveInteger("SONG_MEDIA_BACKFILL_MAX_ATTEMPTS", 4);
const baseDelayMs = readPositiveInteger("SONG_MEDIA_BACKFILL_BASE_DELAY_MS", 500);

type BackfillStats = {
  updated: number;
  skipped: number;
  failed: number;
};

async function main() {
  const staleBefore = new Date(Date.now() - songMediaDetailsFreshnessMs);
  const rows = await findSongMediaNeedingRefresh(staleBefore, limit);
  const stats: BackfillStats = {
    updated: 0,
    skipped: 0,
    failed: 0
  };

  console.info(
    `Backfilling ${rows.length} SongMedia rows with concurrency=${concurrency}, limit=${limit}`
  );

  await mapWithConcurrency(rows, concurrency, async (row) => {
    if (!row.deezerTrackId) {
      stats.skipped += 1;
      return;
    }

    const trackId = Number(row.deezerTrackId);

    try {
      const details = await fetchDetailsWithBackoff(trackId);
      if (!details) {
        stats.skipped += 1;
        console.warn(`Skipped ${row.songId}: Deezer track ${trackId} has no usable preview or cover`);
        return;
      }

      await upsertSongMediaDetails(row.songId, details);
      stats.updated += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(`Failed ${row.songId}: Deezer track ${trackId}`, error);
    }
  });

  console.info(
    `SongMedia backfill finished: updated=${stats.updated}, skipped=${stats.skipped}, failed=${stats.failed}`
  );

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

async function fetchDetailsWithBackoff(trackId: number) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return songMediaPayloadFromDeezerTrack(await getDeezerTrack(trackId));
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  return null;
}

async function mapWithConcurrency<T>(
  items: T[],
  workerCount: number,
  callback: (item: T) => Promise<void>
) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(workerCount, items.length) }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await callback(item);
      }
    })
  );
}

function readPositiveInteger(name: string, fallback: number, max?: number) {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;

  return max === undefined ? value : Math.min(value, max);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
