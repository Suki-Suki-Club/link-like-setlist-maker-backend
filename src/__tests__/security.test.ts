import { describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  process.env.BACKEND_API_TOKEN = "test-backend-token";

  const now = new Date("2026-06-24T00:00:00.000Z");
  const unit = {
    id: "hasunosora",
    name: "蓮ノ空女学院スクールアイドルクラブ",
    sortOrder: 1,
    createdAt: now,
    updatedAt: now
  };
  const song = {
    id: "dream-believers",
    title: "Dream Believers",
    titleJa: "Dream Believers",
    unitId: unit.id,
    sortOrder: 1,
    releaseDate: null,
    unit,
    createdAt: now,
    updatedAt: now
  };
  const setlist = {
    id: "existing-setlist",
    title: "Existing setlist",
    description: null,
    songIds: [],
    contentHash: null,
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now
  };

  const prismaMock = {
    setlist: {
      findMany: async () => [setlist],
      findUnique: async ({ where }: { where: { id?: string; contentHash?: string } }) =>
        where.id === setlist.id ? setlist : null,
      create: async () => setlist,
      update: async () => setlist,
      delete: async () => setlist
    },
    song: {
      findMany: async ({ where, select }: { where?: { id?: { in?: string[] } }; select?: { id?: boolean } } = {}) => {
        if (select?.id && where?.id?.in) {
          return where.id.in.map((id) => ({ id }));
        }

        return [song];
      },
      findUnique: async () => null
    },
    unit: {
      findMany: async () => [unit]
    },
    songMedia: {
      findUnique: async () => null,
      findMany: async () => [
        {
          songId: "dream-believers",
          status: "unavailable",
          deezerTrackId: null,
          createdAt: now,
          updatedAt: now
        }
      ],
      upsert: async () => ({
        songId: "missing-song",
        status: "unavailable",
        deezerTrackId: null,
        createdAt: now,
        updatedAt: now
      })
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(prismaMock)
  };

  return { prismaMock };
});

vi.mock("../db/client.js", () => ({
  prisma: prismaMock
}));

const { default: app } = await import("../app.js");

const serviceAuthHeaders = {
  authorization: "Bearer test-backend-token"
};

describe("public API exposure", () => {
  it("does not expose setlist listing, update, or delete endpoints", async () => {
    const listResponse = await app.request("/api/setlists");
    const updateResponse = await app.request("/api/setlists/existing-setlist", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated", items: [{ songId: "dream-believers" }] })
    });
    const deleteResponse = await app.request("/api/setlists/existing-setlist", {
      method: "DELETE"
    });
    const openApiResponse = await app.request("/openapi.json");
    const openApi = (await openApiResponse.json()) as {
      paths: Record<string, Record<string, unknown>>;
    };

    expect(listResponse.status).toBe(404);
    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    expect(openApi.paths["/api/setlists"]).not.toHaveProperty("get");
    expect(openApi.paths["/api/setlists/{id}"]).not.toHaveProperty("put");
    expect(openApi.paths["/api/setlists/{id}"]).not.toHaveProperty("delete");
  });
});

describe("public API abuse limits", () => {
  it("requires a service token for protected backend actions", async () => {
    const missingTokenResponse = await app.request("/api/setlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Opening block", items: [] })
    });
    const invalidTokenResponse = await app.request("/api/setlists", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({ title: "Opening block", items: [] })
    });
    const mediaResponse = await app.request("/api/song-media/dream-believers");

    expect(missingTokenResponse.status).toBe(401);
    expect(invalidTokenResponse.status).toBe(401);
    expect(mediaResponse.status).toBe(401);
    await expect(missingTokenResponse.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED", message: "Backend API token is required" }
    });
  });

  it("rate limits repeated setlist creation attempts by client IP", async () => {
    const headers = {
      ...serviceAuthHeaders,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10"
    };

    for (let index = 0; index < 20; index += 1) {
      const response = await app.request("/api/setlists", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "   ", items: [] })
      });
      expect(response.status).toBe(400);
    }

    const limitedResponse = await app.request("/api/setlists", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "   ", items: [] })
    });

    expect(limitedResponse.status).toBe(429);
    await expect(limitedResponse.json()).resolves.toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests" }
    });
  });

  it("rejects oversized JSON request bodies before validation or persistence", async () => {
    const body = JSON.stringify({
      title: "Oversized setlist",
      description: "x".repeat(20_000),
      items: []
    });
    const response = await app.request("/api/setlists", {
      method: "POST",
      headers: {
        ...serviceAuthHeaders,
        "content-length": String(body.length),
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.11"
      },
      body
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" }
    });
  });

  it("does not rate limit authenticated media read attempts", async () => {
    const headers = {
      ...serviceAuthHeaders,
      "x-forwarded-for": "203.0.113.12"
    };

    for (let index = 0; index < 21; index += 1) {
      const response = await app.request("/api/song-media/missing-song", {
        headers
      });
      expect(response.status).toBe(404);
    }
  });
});
