import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadConfigModule() {
  vi.resetModules();
  return import("../config.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("config", () => {
  it("requires DATABASE_URL when database env vars are unset", async () => {
    process.env.DATABASE_URL = "";
    process.env.DIRECT_URL = "";
    process.env.DOTENV_CONFIG_PATH = ".env.test.missing";

    const { createAppConfig } = await loadConfigModule();

    expect(() => createAppConfig()).toThrow(/DATABASE_URL/);
  });

  it("falls back to DATABASE_URL when DIRECT_URL is unset", async () => {
    process.env.DATABASE_URL = "postgresql://app-user:secret@db.example.com:5432/app";
    delete process.env.DIRECT_URL;

    const { config } = await loadConfigModule();

    expect(config.databaseUrl).toBe("postgresql://app-user:secret@db.example.com:5432/app");
    expect(config.directUrl).toBe("postgresql://app-user:secret@db.example.com:5432/app");
  });

  it("reads both DATABASE_URL and DIRECT_URL from env", async () => {
    process.env.DATABASE_URL = "postgresql://app-user:secret@127.0.0.1:54322/postgres";
    process.env.DIRECT_URL = "postgresql://direct-user:secret@127.0.0.1:54322/postgres";

    const { config } = await loadConfigModule();

    expect(config.databaseUrl).toBe("postgresql://app-user:secret@127.0.0.1:54322/postgres");
    expect(config.directUrl).toBe("postgresql://direct-user:secret@127.0.0.1:54322/postgres");
  });

  it("requires BACKEND_API_TOKEN in production", async () => {
    process.env.DATABASE_URL = "postgresql://app-user:secret@db.example.com:5432/app";
    process.env.DOTENV_CONFIG_PATH = ".env.test.missing";
    process.env.NODE_ENV = "production";
    delete process.env.BACKEND_API_TOKEN;

    const { createAppConfig } = await loadConfigModule();

    expect(() => createAppConfig()).toThrow(/BACKEND_API_TOKEN/);
  });

  it("reads BACKEND_API_TOKEN from env outside production", async () => {
    process.env.BACKEND_API_TOKEN = "test-backend-token";
    process.env.DATABASE_URL = "postgresql://app-user:secret@db.example.com:5432/app";
    process.env.NODE_ENV = "test";

    const { config } = await loadConfigModule();

    expect(config.backendApiToken).toBe("test-backend-token");
  });
});
