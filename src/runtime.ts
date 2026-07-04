import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { MiddlewareHandler } from "hono";

export type RuntimeEnv = {
  BACKEND_API_TOKEN?: string;
  CORS_ORIGIN?: string;
  DATABASE_URL?: string;
  DEEZER_API_BASE_URL?: string;
  DEEZER_REQUEST_TIMEOUT_MS?: string;
  DIRECT_URL?: string;
  MAX_JSON_BODY_BYTES?: string;
  NODE_ENV?: string;
  PORT?: string;
  SETLIST_CREATE_RATE_LIMIT_MAX?: string;
  SETLIST_CREATE_RATE_LIMIT_WINDOW_MS?: string;
  SUPABASE_JWKS_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_URL?: string;
  HYPERDRIVE?: {
    connectionString: string;
  };
};

export type AppConfig = {
  backendApiToken: string;
  corsOrigin: string;
  databaseUrl: string;
  deezerApiBaseUrl: string;
  deezerRequestTimeoutMs: number;
  directUrl: string;
  maxJsonBodyBytes: number;
  port: number;
  setlistCreateRateLimitMax: number;
  setlistCreateRateLimitWindowMs: number;
  supabaseJwksUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  supabaseUrl?: string;
};

type RuntimeContext = {
  env: RuntimeEnv;
  prisma: PrismaClient;
};

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

const runtimeContextStorage = new AsyncLocalStorage<RuntimeContext>();
const workerPrismaByConnectionString = new Map<string, PrismaClient>();

function envValue(env: RuntimeEnv, name: keyof RuntimeEnv) {
  const value = env[name];
  return typeof value === "string" ? value : process.env[name];
}

function numberFromEnv(
  env: RuntimeEnv,
  name: keyof RuntimeEnv,
  fallback: number,
) {
  const value = envValue(env, name);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringFromEnv(env: RuntimeEnv, name: keyof RuntimeEnv) {
  const value = envValue(env, name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function createAppConfig(env: RuntimeEnv = {}): AppConfig {
  const databaseUrl = stringFromEnv(env, "DATABASE_URL");
  const backendApiToken = envValue(env, "BACKEND_API_TOKEN") ?? "";
  const nodeEnv = envValue(env, "NODE_ENV") ?? process.env.NODE_ENV;

  if (nodeEnv === "production" && !backendApiToken) {
    throw new Error("BACKEND_API_TOKEN is required in production.");
  }

  return {
    port: numberFromEnv(env, "PORT" as keyof RuntimeEnv, 3000),
    backendApiToken,
    corsOrigin: envValue(env, "CORS_ORIGIN") ?? "http://localhost:5173",
    databaseUrl,
    directUrl: envValue(env, "DIRECT_URL") ?? databaseUrl,
    deezerApiBaseUrl:
      envValue(env, "DEEZER_API_BASE_URL") ?? "https://api.deezer.com",
    deezerRequestTimeoutMs: numberFromEnv(
      env,
      "DEEZER_REQUEST_TIMEOUT_MS",
      5000,
    ),
    maxJsonBodyBytes: numberFromEnv(env, "MAX_JSON_BODY_BYTES", 16 * 1024),
    setlistCreateRateLimitMax: numberFromEnv(
      env,
      "SETLIST_CREATE_RATE_LIMIT_MAX",
      20,
    ),
    setlistCreateRateLimitWindowMs: numberFromEnv(
      env,
      "SETLIST_CREATE_RATE_LIMIT_WINDOW_MS",
      60 * 1000,
    ),
    supabaseJwksUrl: envValue(env, "SUPABASE_JWKS_URL"),
    supabasePublishableKey: envValue(env, "SUPABASE_PUBLISHABLE_KEY"),
    supabaseSecretKey: envValue(env, "SUPABASE_SECRET_KEY"),
    supabaseUrl: envValue(env, "SUPABASE_URL"),
  };
}

export function getRuntimeContext() {
  return runtimeContextStorage.getStore() ?? null;
}

export function getRuntimeConfig() {
  return createAppConfig(getRuntimeContext()?.env ?? {});
}

export async function runWithRuntimeContext<T>(
  env: RuntimeEnv,
  _executionContext: ExecutionContextLike | undefined,
  callback: () => Promise<T>,
) {
  const config = createAppConfig(env);
  const connectionString = env.HYPERDRIVE?.connectionString ?? config.databaseUrl;
  let prisma = workerPrismaByConnectionString.get(connectionString);

  if (!prisma) {
    const adapter = new PrismaPg({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    prisma = new PrismaClient({ adapter });
    workerPrismaByConnectionString.set(connectionString, prisma);
  }

  return runtimeContextStorage.run({ env, prisma }, async () => {
    return callback();
  });
}

export function createRuntimeMiddleware(): MiddlewareHandler<{
  Bindings: RuntimeEnv;
}> {
  return async (c, next) => {
    if (!c.env?.DATABASE_URL) {
      return next();
    }

    return runWithRuntimeContext(c.env, c.executionCtx, next);
  };
}
