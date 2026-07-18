import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/db/client.js";

type SeriesSeed = {
  id: string;
  name: string;
  sortOrder: number;
};

type UnitSeed = {
  id: string;
  name: string;
  seriesId: string;
  sortOrder: number;
};

type SongSeed = {
  id: string;
  title: string;
  titleJa?: string;
  unitId: string;
  sortOrder: number;
  releaseDate?: string;
  deezerTrackId?: number | null;
};

async function readSeedJson<T>(fileName: string): Promise<T> {
  const filePath = join(process.cwd(), "prisma", "seed-data", fileName);
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function seedCatalog() {
  const [series, units, songs] = await Promise.all([
    readSeedJson<SeriesSeed[]>("series.json"),
    readSeedJson<UnitSeed[]>("units.json"),
    readSeedJson<SongSeed[]>("songs.json")
  ]);

  await prisma.$transaction(
    async (tx) => {
      for (const seriesEntry of series) {
        await tx.series.upsert({
          where: { id: seriesEntry.id },
          update: seriesEntry,
          create: seriesEntry
        });
      }

      for (const unit of units) {
        await tx.unit.upsert({
          where: { id: unit.id },
          update: unit,
          create: unit
        });
      }

      for (const song of songs) {
        const songData = {
          id: song.id,
          title: song.title,
          titleJa: song.titleJa ?? song.title,
          unitId: song.unitId,
          sortOrder: song.sortOrder,
          releaseDate: song.releaseDate ? new Date(song.releaseDate) : null
        };

        await tx.song.upsert({
          where: { id: song.id },
          update: songData,
          create: songData
        });

        await tx.songMedia.upsert({
          where: { songId: song.id },
          update: {
            status: song.deezerTrackId == null ? "unavailable" : "available",
            deezerTrackId: song.deezerTrackId == null ? null : BigInt(song.deezerTrackId)
          },
          create: {
            songId: song.id,
            status: song.deezerTrackId == null ? "unavailable" : "available",
            deezerTrackId: song.deezerTrackId == null ? null : BigInt(song.deezerTrackId)
          }
        });
      }
    },
    {
      maxWait: 10_000,
      timeout: 60_000
    }
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedCatalog()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
