import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeezerTrack } from "../clients/deezerClient.js";
import { findSongById } from "../repositories/catalogRepository.js";
import {
  findSongMedia,
  findSongMediaBySongIds,
  upsertSongMediaDetails
} from "../repositories/songMediaRepository.js";
import {
  clearSongMediaMemoryCache,
  getPersistedSongMediaBySongIds,
  getSongMedia,
  getSongMediaBySongIds
} from "../services/songMediaService.js";

vi.mock("../clients/deezerClient.js", () => ({
  getDeezerTrack: vi.fn()
}));

vi.mock("../repositories/catalogRepository.js", () => ({
  findSongById: vi.fn()
}));

vi.mock("../repositories/songMediaRepository.js", () => ({
  findSongMedia: vi.fn(),
  findSongMediaBySongIds: vi.fn(),
  upsertSongMediaDetails: vi.fn()
}));

const getDeezerTrackMock = vi.mocked(getDeezerTrack);
const findSongByIdMock = vi.mocked(findSongById);
const findSongMediaMock = vi.mocked(findSongMedia);
const findSongMediaBySongIdsMock = vi.mocked(findSongMediaBySongIds);
const upsertSongMediaDetailsMock = vi.mocked(upsertSongMediaDetails);
const now = new Date("2026-07-04T00:00:00.000Z");

function createSongMedia(
  songId: string,
  deezerTrackId: number | null,
  status = "available",
  overrides: Record<string, unknown> = {}
) {
  return {
    songId,
    status,
    deezerTrackId: deezerTrackId === null ? null : BigInt(deezerTrackId),
    title: null,
    artistName: null,
    albumTitle: null,
    duration: null,
    coverUrl: null,
    previewUrl: null,
    trackLink: null,
    isrc: null,
    rank: null,
    fetchedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createDeezerTrack(trackId: number, overrides: Record<string, unknown> = {}) {
  return {
    id: trackId,
    readable: true,
    title: "Dream Believers",
    isrc: "JPI102300001",
    link: `https://www.deezer.com/track/${trackId}`,
    duration: 284,
    rank: 41585,
    preview: "https://cdnt-preview.dzcdn.net/dream.mp3",
    artist: { id: 205924787, name: "蓮ノ空女学院スクールアイドルクラブ", type: "artist" },
    album: {
      id: 635338091,
      title: "Dream Believers",
      cover_xl: "https://e-cdns-images.dzcdn.net/images/cover/dream-xl.jpg",
      type: "album"
    },
    type: "track",
    ...overrides
  };
}

beforeEach(() => {
  clearSongMediaMemoryCache();
  vi.clearAllMocks();
  findSongByIdMock.mockResolvedValue({ id: "dream-believers" } as never);
});

describe("songMediaService", () => {
  it("always re-resolves from Deezer even when persisted media looks fresh, since previewUrl lifetime is unpredictable", async () => {
    findSongMediaMock.mockResolvedValue(
      createSongMedia("dream-believers", 2967993121, "available", {
        title: "Dream Believers",
        artistName: "蓮ノ空女学院スクールアイドルクラブ",
        albumTitle: "Dream Believers",
        duration: 284,
        coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/dream-xl.jpg",
        previewUrl: "https://cdnt-preview.dzcdn.net/stale-dream.mp3",
        trackLink: "https://www.deezer.com/track/2967993121",
        isrc: "JPI102300001",
        rank: 41585,
        fetchedAt: new Date(Date.now() - 60 * 1000)
      })
    );
    getDeezerTrackMock.mockResolvedValue(
      createDeezerTrack(2967993121, { preview: "https://cdnt-preview.dzcdn.net/refreshed-dream.mp3" })
    );

    const result = await getSongMedia("dream-believers");

    expect(result).toMatchObject({
      songId: "dream-believers",
      status: "available",
      media: {
        previewUrl: "https://cdnt-preview.dzcdn.net/refreshed-dream.mp3",
        coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/dream-xl.jpg"
      }
    });
    expect(getDeezerTrackMock).toHaveBeenCalledWith(2967993121);
    expect(upsertSongMediaDetailsMock).toHaveBeenCalledWith(
      "dream-believers",
      expect.objectContaining({
        previewUrl: "https://cdnt-preview.dzcdn.net/refreshed-dream.mp3"
      }),
      expect.any(Date)
    );
  });

  it("returns available media from a manually managed Deezer track id", async () => {
    findSongMediaMock.mockResolvedValue(createSongMedia("dream-believers", 2967993121));
    getDeezerTrackMock.mockResolvedValue(createDeezerTrack(2967993121));

    const result = await getSongMedia("dream-believers");

    expect(result).toMatchObject({
      songId: "dream-believers",
      status: "available",
      media: {
        deezerTrackId: 2967993121,
        title: "Dream Believers",
        artistName: "蓮ノ空女学院スクールアイドルクラブ",
        albumTitle: "Dream Believers",
        coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/dream-xl.jpg",
        previewUrl: "https://cdnt-preview.dzcdn.net/dream.mp3"
      }
    });
    expect(getDeezerTrackMock).toHaveBeenCalledWith(2967993121);
    expect(upsertSongMediaDetailsMock).toHaveBeenCalledWith(
      "dream-believers",
      expect.objectContaining({
        deezerTrackId: 2967993121,
        title: "Dream Believers",
        artistName: "蓮ノ空女学院スクールアイドルクラブ",
        albumTitle: "Dream Believers",
        duration: 284,
        coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/dream-xl.jpg",
        previewUrl: "https://cdnt-preview.dzcdn.net/dream.mp3",
        trackLink: "https://www.deezer.com/track/2967993121",
        isrc: "JPI102300001",
        rank: 41585
      }),
      expect.any(Date)
    );
  });

  it("returns unavailable without reading Deezer when media is not available", async () => {
    findSongMediaMock.mockResolvedValue(createSongMedia("perenial", null, "unavailable"));

    await expect(getSongMedia("perenial")).resolves.toEqual({
      songId: "perenial",
      status: "unavailable",
      media: null
    });
    expect(getDeezerTrackMock).not.toHaveBeenCalled();
  });

  it("returns unavailable when Deezer details are missing cover or preview data", async () => {
    findSongMediaMock.mockResolvedValue(createSongMedia("dream-believers", 2967993121));
    getDeezerTrackMock.mockResolvedValue(createDeezerTrack(2967993121, { preview: "" }));

    await expect(getSongMedia("dream-believers")).resolves.toEqual({
      songId: "dream-believers",
      status: "unavailable",
      media: null
    });
  });

  it("retries Deezer track details twice before returning unavailable", async () => {
    findSongMediaMock.mockResolvedValue(createSongMedia("dream-believers", 2967993121));
    getDeezerTrackMock.mockRejectedValue(new Error("too many requests"));

    await expect(getSongMedia("dream-believers")).resolves.toEqual({
      songId: "dream-believers",
      status: "unavailable",
      media: null
    });
    expect(getDeezerTrackMock).toHaveBeenCalledTimes(3);
  });

  it("uses the in-process memory cache for repeated Deezer track lookups", async () => {
    findSongMediaMock.mockResolvedValue(createSongMedia("dream-believers", 2967993121));
    getDeezerTrackMock.mockResolvedValue(createDeezerTrack(2967993121));

    await getSongMedia("dream-believers");
    await getSongMedia("dream-believers");

    expect(getDeezerTrackMock).toHaveBeenCalledTimes(1);
  });

  it("returns unavailable per song in bulk lookups instead of failing the whole response", async () => {
    findSongMediaBySongIdsMock.mockResolvedValue([
      createSongMedia("dream-believers", 2967993121),
      createSongMedia("perenial", null, "unavailable")
    ]);
    getDeezerTrackMock.mockResolvedValue(createDeezerTrack(2967993121));

    await expect(getSongMediaBySongIds(["dream-believers", "perenial"])).resolves.toMatchObject({
      "dream-believers": { status: "available", media: { previewUrl: "https://cdnt-preview.dzcdn.net/dream.mp3" } },
      perenial: { status: "unavailable", media: null }
    });
  });

  it("returns persisted bulk media without refreshing stale rows from Deezer", async () => {
    findSongMediaBySongIdsMock.mockResolvedValue([
      createSongMedia("dream-believers", 2967993121, "available", {
        title: "Dream Believers",
        artistName: "蓮ノ空女学院スクールアイドルクラブ",
        albumTitle: "Dream Believers",
        duration: 284,
        coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/dream-xl.jpg",
        previewUrl: "https://cdnt-preview.dzcdn.net/dream.mp3",
        trackLink: "https://www.deezer.com/track/2967993121",
        isrc: "JPI102300001",
        rank: 41585,
        fetchedAt: new Date("2026-05-01T00:00:00.000Z")
      }),
      createSongMedia("perenial", null, "unavailable")
    ]);

    await expect(getPersistedSongMediaBySongIds(["dream-believers", "perenial"])).resolves.toMatchObject({
      "dream-believers": { status: "available", media: { previewUrl: "https://cdnt-preview.dzcdn.net/dream.mp3" } },
      perenial: { status: "unavailable", media: null }
    });
    expect(getDeezerTrackMock).not.toHaveBeenCalled();
  });

  it("throws a not found error for an unknown song lookup", async () => {
    findSongByIdMock.mockResolvedValue(null);

    await expect(getSongMedia("missing-song")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Song not found"
    });
  });
});
