import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";

const unitInclude = {
  series: true
} satisfies Prisma.UnitInclude;

const songInclude = {
  unit: {
    include: unitInclude
  }
} satisfies Prisma.SongInclude;

export type UnitWithSeries = Prisma.UnitGetPayload<{ include: typeof unitInclude }>;
export type SongWithUnit = Prisma.SongGetPayload<{ include: typeof songInclude }>;

export async function listUnits() {
  return prisma.unit.findMany({
    include: unitInclude,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}

export async function listSongs(filters: { q?: string; unitId?: string }) {
  return prisma.song.findMany({
    where: {
      unitId: filters.unitId,
      OR: filters.q
        ? [
            {
              title: {
                contains: filters.q,
                mode: "insensitive"
              }
            },
            {
              titleJa: {
                contains: filters.q,
                mode: "insensitive"
              }
            }
          ]
        : undefined
    },
    include: songInclude,
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
  });
}

export async function findSongById(id: string) {
  return prisma.song.findUnique({
    where: { id },
    include: songInclude
  });
}

export async function findSongsByIds(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  return prisma.song.findMany({
    where: {
      id: {
        in: Array.from(new Set(ids))
      }
    },
    include: songInclude
  });
}

export async function findExistingSongIds(songIds: string[]) {
  if (songIds.length === 0) {
    return new Set<string>();
  }

  const songs = await prisma.song.findMany({
    where: {
      id: {
        in: Array.from(new Set(songIds))
      }
    },
    select: {
      id: true
    }
  });

  return new Set(songs.map((song) => song.id));
}
