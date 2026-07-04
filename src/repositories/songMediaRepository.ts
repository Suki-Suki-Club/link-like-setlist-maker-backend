import { prisma } from "../db/client.js";

export type SongMediaDetailsInput = {
  deezerTrackId: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  duration: number | null;
  coverUrl: string;
  previewUrl: string;
  trackLink: string | null;
  isrc: string | null;
  rank: number | null;
};

export async function findSongMedia(songId: string) {
  return prisma.songMedia.findUnique({
    where: { songId }
  });
}

export async function findSongMediaBySongIds(songIds: string[]) {
  if (songIds.length === 0) {
    return [];
  }

  return prisma.songMedia.findMany({
    where: {
      songId: {
        in: Array.from(new Set(songIds))
      }
    }
  });
}

export async function upsertSongMediaDetails(
  songId: string,
  details: SongMediaDetailsInput,
  fetchedAt = new Date()
) {
  const data = {
    status: "available",
    deezerTrackId: BigInt(details.deezerTrackId),
    title: details.title,
    artistName: details.artistName,
    albumTitle: details.albumTitle,
    duration: details.duration,
    coverUrl: details.coverUrl,
    previewUrl: details.previewUrl,
    trackLink: details.trackLink,
    isrc: details.isrc,
    rank: details.rank,
    fetchedAt
  };

  return prisma.songMedia.upsert({
    where: { songId },
    update: data,
    create: {
      songId,
      ...data
    }
  });
}

export async function findSongMediaNeedingRefresh(staleBefore: Date, take = 100) {
  return prisma.songMedia.findMany({
    where: {
      status: "available",
      deezerTrackId: {
        not: null
      },
      OR: [
        { fetchedAt: null },
        { fetchedAt: { lt: staleBefore } },
        { title: null },
        { artistName: null },
        { coverUrl: null },
        { previewUrl: null }
      ]
    },
    orderBy: [{ fetchedAt: "asc" }, { updatedAt: "asc" }],
    take
  });
}
