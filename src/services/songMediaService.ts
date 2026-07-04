import type { SongMedia } from "@prisma/client";
import { getDeezerTrack, type DeezerTrack } from "../clients/deezerClient.js";
import { AppError } from "../errors.js";
import { findSongById } from "../repositories/catalogRepository.js";
import {
  findSongMedia,
  findSongMediaBySongIds,
  type SongMediaDetailsInput,
  upsertSongMediaDetails
} from "../repositories/songMediaRepository.js";

type SongMediaStatus = "available" | "unavailable";

export type SongMediaPayload = SongMediaDetailsInput;

export type SongMediaResponse = {
  songId: string;
  status: SongMediaStatus;
  media: SongMediaPayload | null;
};

type CachedTrackResult = {
  expiresAt: number;
  media: SongMediaPayload | null;
};

const successCacheTtlMs = 24 * 60 * 60 * 1000;
const failureCacheTtlMs = 5 * 60 * 1000;
export const songMediaDetailsFreshnessMs = 30 * 24 * 60 * 60 * 1000;
const deezerRetryCount = 2;
const mediaLookupConcurrency = 5;
const trackCache = new Map<number, CachedTrackResult>();

export async function getSongMedia(songId: string): Promise<SongMediaResponse> {
  const song = await findSongById(songId);
  if (!song) {
    throw new AppError(404, "NOT_FOUND", "Song not found");
  }

  return resolveSongMedia(songId, await findSongMedia(songId));
}

export async function getSongMediaBySongIds(songIds: string[]): Promise<Record<string, SongMediaResponse>> {
  const uniqueSongIds = Array.from(new Set(songIds.map((songId) => songId.trim()).filter(Boolean)));
  const mediaRows = await findSongMediaBySongIds(uniqueSongIds);
  const mediaBySongId = new Map(mediaRows.map((media) => [media.songId, media]));
  const results: Record<string, SongMediaResponse> = {};

  await mapWithConcurrency(uniqueSongIds, mediaLookupConcurrency, async (songId) => {
    results[songId] = await resolveSongMedia(songId, mediaBySongId.get(songId) ?? null);
  });

  return results;
}

export async function getPersistedSongMediaBySongIds(songIds: string[]): Promise<Record<string, SongMediaResponse>> {
  const uniqueSongIds = Array.from(new Set(songIds.map((songId) => songId.trim()).filter(Boolean)));
  const mediaRows = await findSongMediaBySongIds(uniqueSongIds);
  const mediaBySongId = new Map(mediaRows.map((media) => [media.songId, media]));
  const results: Record<string, SongMediaResponse> = {};

  for (const songId of uniqueSongIds) {
    const media = mediaBySongId.get(songId) ?? null;
    const persistedMedia = media?.status === "available" ? mediaPayloadFromPersistedRow(media) : null;

    results[songId] = persistedMedia
      ? {
          songId,
          status: "available",
          media: persistedMedia
        }
      : unavailableSongMedia(songId);
  }

  return results;
}

export function clearSongMediaMemoryCache() {
  trackCache.clear();
}

async function resolveSongMedia(songId: string, media: SongMedia | null): Promise<SongMediaResponse> {
  if (!media || media.status !== "available" || !media.deezerTrackId) {
    return unavailableSongMedia(songId);
  }

  const persistedMedia = mediaPayloadFromPersistedRow(media);
  if (persistedMedia && isFreshSongMediaDetails(media.fetchedAt)) {
    return {
      songId,
      status: "available",
      media: persistedMedia
    };
  }

  const resolvedMedia = await resolveDeezerTrack(Number(media.deezerTrackId));
  if (!resolvedMedia) {
    return unavailableSongMedia(songId);
  }

  await upsertSongMediaDetails(songId, resolvedMedia);

  return {
    songId,
    status: "available",
    media: resolvedMedia
  };
}

async function resolveDeezerTrack(trackId: number): Promise<SongMediaPayload | null> {
  const now = Date.now();
  const cached = trackCache.get(trackId);
  if (cached && cached.expiresAt > now) {
    return cached.media;
  }

  const media = await fetchDeezerTrackWithRetry(trackId);
  trackCache.set(trackId, {
    media,
    expiresAt: now + (media ? successCacheTtlMs : failureCacheTtlMs)
  });

  return media;
}

async function fetchDeezerTrackWithRetry(trackId: number): Promise<SongMediaPayload | null> {
  for (let attempt = 0; attempt <= deezerRetryCount; attempt += 1) {
    try {
      return songMediaPayloadFromDeezerTrack(await getDeezerTrack(trackId));
    } catch {
      if (attempt === deezerRetryCount) {
        return null;
      }
    }
  }

  return null;
}

export function songMediaPayloadFromDeezerTrack(track: DeezerTrack): SongMediaPayload | null {
  const previewUrl = typeof track.preview === "string" ? track.preview.trim() : "";
  const coverUrl = pickCoverUrl(track);

  if (!previewUrl || !coverUrl) {
    return null;
  }

  return {
    deezerTrackId: track.id,
    title: track.title,
    artistName: track.artist.name,
    albumTitle: track.album?.title ?? null,
    duration: track.duration ?? null,
    coverUrl,
    previewUrl,
    trackLink: track.link ?? null,
    isrc: track.isrc ?? null,
    rank: track.rank ?? null
  };
}

function mediaPayloadFromPersistedRow(media: SongMedia): SongMediaPayload | null {
  if (!media.deezerTrackId || !media.title || !media.artistName || !media.coverUrl || !media.previewUrl) {
    return null;
  }

  return {
    deezerTrackId: Number(media.deezerTrackId),
    title: media.title,
    artistName: media.artistName,
    albumTitle: media.albumTitle,
    duration: media.duration,
    coverUrl: media.coverUrl,
    previewUrl: media.previewUrl,
    trackLink: media.trackLink,
    isrc: media.isrc,
    rank: media.rank
  };
}

function isFreshSongMediaDetails(fetchedAt: Date | null) {
  return fetchedAt !== null && Date.now() - fetchedAt.getTime() <= songMediaDetailsFreshnessMs;
}

function pickCoverUrl(track: DeezerTrack) {
  return track.album?.cover_xl ?? track.album?.cover_big ?? track.album?.cover_medium ?? null;
}

function unavailableSongMedia(songId: string): SongMediaResponse {
  return {
    songId,
    status: "unavailable",
    media: null
  };
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<void>
) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await callback(item);
      }
    })
  );
}
