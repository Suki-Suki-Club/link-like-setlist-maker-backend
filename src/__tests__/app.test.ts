import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";
import { prisma } from "../db/client.js";
import { seedCatalog } from "../../prisma/seed.js";
import { clearSongMediaMemoryCache } from "../services/songMediaService.js";

async function resetDatabase() {
  await prisma.songMedia.deleteMany();
  await prisma.setlist.deleteMany();
  await prisma.song.deleteMany();
  await prisma.unit.deleteMany();
  await seedCatalog();
}

async function readJson(response: Response) {
  return response.json() as Promise<unknown>;
}

const serviceAuthHeaders = {
  authorization: `Bearer ${process.env.BACKEND_API_TOKEN ?? "test-backend-token"}`
};

function createDeezerTrackResponse(trackId: number, overrides: Record<string, unknown> = {}) {
  return {
    id: trackId,
    readable: true,
    title: "Holiday∞Holiday",
    isrc: "JPI102300074",
    link: `https://www.deezer.com/track/${trackId}`,
    duration: 256,
    rank: 41585,
    preview: "https://cdnt-preview.dzcdn.net/holiday.mp3",
    artist: { id: 205924787, name: "スリーズブーケ", type: "artist" },
    album: {
      id: 635338091,
      title: "Holiday∞Holiday / Tragic Drops【スリーズブーケ盤】",
      cover_xl: "https://e-cdns-images.dzcdn.net/images/cover/holiday-xl.jpg",
      type: "album"
    },
    type: "track",
    ...overrides
  };
}

beforeEach(async () => {
  clearSongMediaMemoryCache();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("health and docs", () => {
  it("returns health status", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual({ status: "ok" });
  });

  it("serves OpenAPI JSON and Swagger UI", async () => {
    const openApiResponse = await app.request("/openapi.json");
    const docsResponse = await app.request("/docs");

    expect(openApiResponse.status).toBe(200);
    expect(docsResponse.status).toBe(200);
    expect(openApiResponse.headers.get("content-type")).toContain("application/json");
    expect(docsResponse.headers.get("content-type")).toContain("text/html");
  });
});

describe("catalog API", () => {
  it("returns seeded units and songs", async () => {
    const unitsResponse = await app.request("/api/units");
    const songsResponse = await app.request("/api/songs");

    expect(unitsResponse.status).toBe(200);
    expect(songsResponse.status).toBe(200);

    const units = (await unitsResponse.json()) as { units: Array<{ id: string; name: string }> };
    const songs = (await songsResponse.json()) as {
      songs: Array<{ id: string; title: string; unitId: string }>;
    };

    expect(units.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "hasunosora", name: "蓮ノ空女学院スクールアイドルクラブ" })
      ])
    );
    expect(songs.songs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "dream-believers", title: "Dream Believers" }),
        expect.objectContaining({ id: "eien-no-euphoria", title: "永遠のEuphoria" }),
        expect.objectContaining({ id: "holiday-holiday", title: "Holiday∞Holiday" })
      ])
    );
  });

  it("filters songs by query and unit", async () => {
    const response = await app.request("/api/songs?q=holiday&unitId=cerise-bouquet");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { songs: Array<{ id: string; title: string; unitId: string }> };

    expect(body.songs).toHaveLength(1);
    expect(body.songs[0]).toMatchObject({
      id: "holiday-holiday",
      title: "Holiday∞Holiday",
      unitId: "cerise-bouquet"
    });
  });

  it("returns a single song by id", async () => {
    const response = await app.request("/api/songs/dream-believers");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      song: { id: "dream-believers", title: "Dream Believers" }
    });
  });

  it("returns titleJa for songs without an explicit Japanese seed title", async () => {
    const response = await app.request("/api/songs/awoke");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      song: { id: "awoke", title: "AWOKE", titleJa: "AWOKE" }
    });
  });

  it("returns corrected katakana titleJa when the official title differs from the romanized title", async () => {
    const response = await app.request("/api/songs/scapegoat");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      song: { id: "scapegoat", title: "Scapegoat", titleJa: "スケイプゴート" }
    });
  });

  it("returns songs and media from the catalog bootstrap endpoint", async () => {
    await prisma.songMedia.updateMany({
      data: {
        status: "unavailable",
        deezerTrackId: null
      }
    });
    await prisma.songMedia.update({
      where: { songId: "holiday-holiday" },
      data: {
        status: "available",
        deezerTrackId: BigInt(2967994891),
        title: "Holiday∞Holiday",
        artistName: "スリーズブーケ",
        albumTitle: "Holiday∞Holiday / Tragic Drops【スリーズブーケ盤】",
        duration: 256,
        coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/holiday-xl.jpg",
        previewUrl: "https://cdnt-preview.dzcdn.net/holiday.mp3",
        trackLink: "https://www.deezer.com/track/2967994891",
        isrc: "JPI102300074",
        rank: 41585,
        fetchedAt: new Date("2026-05-01T00:00:00.000Z")
      }
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("bootstrap should use persisted media without fetching Deezer");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/api/catalog/bootstrap", { headers: serviceAuthHeaders });
    const secondResponse = await app.request("/api/catalog/bootstrap", { headers: serviceAuthHeaders });

    expect(response.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      songs: expect.arrayContaining([
        expect.objectContaining({ id: "holiday-holiday", title: "Holiday∞Holiday" })
      ]),
      mediaBySongId: {
        "holiday-holiday": {
          songId: "holiday-holiday",
          status: "available",
          media: {
            previewUrl: "https://cdnt-preview.dzcdn.net/holiday.mp3",
            coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/holiday-xl.jpg"
          }
        },
        "dream-believers": {
          songId: "dream-believers",
          status: "unavailable",
          media: null
        }
      }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("song media API", () => {
  it("resolves available SongMedia from Deezer track details and persists them", async () => {
    await prisma.songMedia.update({
      where: { songId: "holiday-holiday" },
      data: {
        status: "available",
        deezerTrackId: BigInt(2967994891)
      }
    });
    const fetchMock = vi.fn(async () => Response.json(createDeezerTrackResponse(2967994891)));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/api/song-media/holiday-holiday", { headers: serviceAuthHeaders });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      songId: "holiday-holiday",
      status: "available",
      media: {
        deezerTrackId: 2967994891,
        title: "Holiday∞Holiday",
        artistName: "スリーズブーケ",
        albumTitle: "Holiday∞Holiday / Tragic Drops【スリーズブーケ盤】",
        duration: 256,
        coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/holiday-xl.jpg",
        previewUrl: "https://cdnt-preview.dzcdn.net/holiday.mp3",
        trackLink: "https://www.deezer.com/track/2967994891",
        isrc: "JPI102300074"
      }
    });
    await expect(prisma.songMedia.findUnique({ where: { songId: "holiday-holiday" } })).resolves.toMatchObject({
      status: "available",
      deezerTrackId: BigInt(2967994891),
      title: "Holiday∞Holiday",
      artistName: "スリーズブーケ",
      albumTitle: "Holiday∞Holiday / Tragic Drops【スリーズブーケ盤】",
      duration: 256,
      coverUrl: "https://e-cdns-images.dzcdn.net/images/cover/holiday-xl.jpg",
      previewUrl: "https://cdnt-preview.dzcdn.net/holiday.mp3",
      trackLink: "https://www.deezer.com/track/2967994891",
      isrc: "JPI102300074",
      rank: 41585,
      fetchedAt: expect.any(Date)
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns unavailable without calling Deezer when SongMedia is unavailable", async () => {
    await prisma.songMedia.update({
      where: { songId: "on-your-mark" },
      data: {
        status: "unavailable",
        deezerTrackId: null
      }
    });
    const fetchMock = vi.fn(async () => {
      throw new Error("should not fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/api/song-media/on-your-mark", { headers: serviceAuthHeaders });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      songId: "on-your-mark",
      status: "unavailable",
      media: null
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns unavailable when Deezer details lack a cover or preview URL", async () => {
    await prisma.songMedia.update({
      where: { songId: "holiday-holiday" },
      data: {
        status: "available",
        deezerTrackId: BigInt(2967994891)
      }
    });
    const fetchMock = vi.fn(async () => Response.json(createDeezerTrackResponse(2967994891, { preview: "" })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/api/song-media/holiday-holiday", { headers: serviceAuthHeaders });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      songId: "holiday-holiday",
      status: "unavailable",
      media: null
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for media lookup on an unknown song", async () => {
    const response = await app.request("/api/song-media/missing-song", { headers: serviceAuthHeaders });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "Song not found" }
    });
  });
});

describe("setlist API", () => {
  it("creates and reads a setlist", async () => {
    const createResponse = await app.request("/api/setlists", {
      method: "POST",
      headers: { ...serviceAuthHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Opening block",
        description: "Two song flow",
        items: [
          { songId: "dream-believers" },
          { songId: "holiday-holiday" }
        ]
      })
    });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      setlist: { id: string; title: string; items: Array<{ position: number; songId: string }> };
    };
    expect(created.setlist.title).toBe("Opening block");
    expect(created.setlist.items).toEqual([
      { position: 1, songId: "dream-believers" },
      { position: 2, songId: "holiday-holiday" }
    ]);

    const getResponse = await app.request(`/api/setlists/${created.setlist.id}`);
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      setlist: { id: created.setlist.id, title: "Opening block" }
    });
  });

  it("dedupes setlists with identical content", async () => {
    const payload = {
      title: "Encore block",
      description: JSON.stringify({ breaks: [], encoreAfters: [1] }),
      items: [{ songId: "dream-believers" }, { songId: "holiday-holiday" }]
    };
    const createSetlist = (body: Record<string, unknown>) =>
      app.request("/api/setlists", {
        method: "POST",
        headers: { ...serviceAuthHeaders, "content-type": "application/json" },
        body: JSON.stringify(body)
      });

    const firstResponse = await createSetlist(payload);
    expect(firstResponse.status).toBe(201);
    const first = (await firstResponse.json()) as { setlist: { id: string } };

    const duplicateResponse = await createSetlist(payload);
    expect(duplicateResponse.status).toBe(201);
    const duplicate = (await duplicateResponse.json()) as { setlist: { id: string } };
    expect(duplicate.setlist.id).toBe(first.setlist.id);

    const differentResponse = await createSetlist({ ...payload, title: "Another title" });
    expect(differentResponse.status).toBe(201);
    const different = (await differentResponse.json()) as { setlist: { id: string } };
    expect(different.setlist.id).not.toBe(first.setlist.id);

    await expect(prisma.setlist.count()).resolves.toBe(2);
  });

  it("rejects invalid setlist payloads and unknown song ids", async () => {
    const blankTitleResponse = await app.request("/api/setlists", {
      method: "POST",
      headers: { ...serviceAuthHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "   ", items: [] })
    });
    expect(blankTitleResponse.status).toBe(400);

    const malformedItemsResponse = await app.request("/api/setlists", {
      method: "POST",
      headers: { ...serviceAuthHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Bad items", items: [{ memo: "missing song" }] })
    });
    expect(malformedItemsResponse.status).toBe(400);

    const unknownSongResponse = await app.request("/api/setlists", {
      method: "POST",
      headers: { ...serviceAuthHeaders, "content-type": "application/json" },
      body: JSON.stringify({ title: "Unknown song", items: [{ songId: "missing-song" }] })
    });
    expect(unknownSongResponse.status).toBe(400);
    await expect(unknownSongResponse.json()).resolves.toEqual({
      error: { code: "INVALID_SONG", message: "One or more songs do not exist", details: { songIds: ["missing-song"] } }
    });
  });

  it("returns 404 for an unknown setlist id", async () => {
    const response = await app.request("/api/setlists/missing-setlist");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "Setlist not found" }
    });
  });
});
