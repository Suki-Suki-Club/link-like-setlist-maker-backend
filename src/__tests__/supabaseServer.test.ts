import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadSupabaseModule() {
  vi.resetModules();
  return import("../supabaseServer.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getSupabaseServerEnv", () => {
  it("reads the required singular Supabase environment variables", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_example";
    process.env.SUPABASE_JWKS_URL = "https://project.supabase.co/auth/v1/.well-known/jwks.json";

    const { getSupabaseServerEnv } = await loadSupabaseModule();
    const env = getSupabaseServerEnv();

    expect(env.url).toBe("https://project.supabase.co");
    expect(env.publishableKeys).toEqual({ default: "sb_publishable_example" });
    expect(env.secretKeys).toEqual({ default: "sb_secret_example" });
    expect(env.jwks).toBeInstanceOf(URL);
    expect((env.jwks as URL).href).toBe("https://project.supabase.co/auth/v1/.well-known/jwks.json");
  });

  it("requires SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY for Hono context clients", async () => {
    process.env.DATABASE_URL = "postgresql://app-user:secret@db.example.com:5432/app";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;

    const { getSupabaseServerEnv } = await loadSupabaseModule();

    expect(() => getSupabaseServerEnv()).toThrow(/SUPABASE_PUBLISHABLE_KEY/);
  });
});
