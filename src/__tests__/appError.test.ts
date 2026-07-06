import { describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  process.env.BACKEND_API_TOKEN = "test-backend-token";
  process.env.CORS_ORIGIN = "http://localhost:5173";
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/app";
  process.env.DIRECT_URL = process.env.DATABASE_URL;

  return {
    prismaMock: {
      song: {
        findUnique: async () => {
          throw new Error("Failed to acquire a connection from the pool.");
        }
      }
    }
  };
});

vi.mock("../db/client.js", () => ({
  prisma: prismaMock
}));

const { default: app } = await import("../app.js");

describe("global application error handling", () => {
  it("returns a 503 JSON response for database connection exhaustion errors", async () => {
    const response = await app.request("/api/song-media/dream-believers", {
      headers: {
        authorization: "Bearer test-backend-token"
      }
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Database is temporarily unavailable"
      }
    });
  });
});
