import type { SupabaseContext, SupabaseEnv } from "@supabase/server";
import { withSupabase } from "@supabase/server/adapters/hono";
import { resolveEnv } from "@supabase/server/core";
import type { Context } from "hono";
import { config, type RuntimeEnv } from "./config.js";

export type AppEnv = {
  Bindings: RuntimeEnv;
  Variables: {
    supabaseContext: SupabaseContext;
  };
};

export function getSupabaseServerEnv(): SupabaseEnv {
  const jwksUrl = config.supabaseJwksUrl;
  const { data, error } = resolveEnv({
    url: requireSupabaseEnv("SUPABASE_URL", config.supabaseUrl),
    publishableKeys: {
      default: requireSupabaseEnv(
        "SUPABASE_PUBLISHABLE_KEY",
        config.supabasePublishableKey,
      )
    },
    secretKeys: {
      default: requireSupabaseEnv("SUPABASE_SECRET_KEY", config.supabaseSecretKey)
    },
    jwks: jwksUrl ? new URL(jwksUrl) : undefined
  });

  if (error) {
    throw error;
  }

  return data;
}

function requireSupabaseEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function createCatalogSupabaseMiddleware() {
  return withSupabase({
    auth: "none",
    env: getSupabaseServerEnv()
  });
}

export function getSupabaseContext(c: Context<AppEnv>) {
  return c.var.supabaseContext;
}
