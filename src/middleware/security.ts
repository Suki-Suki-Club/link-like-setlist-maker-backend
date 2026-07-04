import type { Context, MiddlewareHandler } from "hono";
import { config } from "../config.js";
import { errorBody } from "../errors.js";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function getClientIp(c: Context) {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "unknown";
}

function getPath(c: Context) {
  return new URL(c.req.url).pathname;
}

function isJsonWriteRequest(c: Context) {
  const method = c.req.method.toUpperCase();
  const contentType = c.req.header("content-type") ?? "";

  return method !== "GET" && method !== "HEAD" && contentType.toLowerCase().includes("application/json");
}

function contentLengthExceedsLimit(c: Context) {
  const rawContentLength = c.req.header("content-length");
  if (!rawContentLength) {
    return false;
  }

  const contentLength = Number.parseInt(rawContentLength, 10);
  return Number.isFinite(contentLength) && contentLength > config.maxJsonBodyBytes;
}

function isSetlistCreate(c: Context) {
  return c.req.method.toUpperCase() === "POST" && getPath(c) === "/api/setlists";
}

function isCatalogBootstrap(c: Context) {
  return c.req.method.toUpperCase() === "GET" && getPath(c) === "/api/catalog/bootstrap";
}

function isSongMediaLookup(c: Context) {
  return c.req.method.toUpperCase() === "GET" && /^\/api\/song-media\/[^/]+$/.test(getPath(c));
}

function requiresBackendApiToken(c: Context) {
  return isSetlistCreate(c) || isCatalogBootstrap(c) || isSongMediaLookup(c);
}

function hasValidBackendApiToken(c: Context) {
  if (!config.backendApiToken) {
    return true;
  }

  const authorization = c.req.header("authorization");
  if (authorization === `Bearer ${config.backendApiToken}`) {
    return true;
  }

  return c.req.header("x-backend-api-token") === config.backendApiToken;
}

function isRateLimited(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const current = rateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return false;
  }

  if (current.count >= maxRequests) {
    return true;
  }

  current.count += 1;
  return false;
}

export function createPublicApiSecurityMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    if (isJsonWriteRequest(c) && contentLengthExceedsLimit(c)) {
      return c.json(errorBody("PAYLOAD_TOO_LARGE", "Request body is too large"), 413);
    }

    if (requiresBackendApiToken(c) && !hasValidBackendApiToken(c)) {
      return c.json(errorBody("UNAUTHORIZED", "Backend API token is required"), 401);
    }

    const clientIp = getClientIp(c);

    if (
      isSetlistCreate(c) &&
      isRateLimited(
        `setlist-create:${clientIp}`,
        config.setlistCreateRateLimitMax,
        config.setlistCreateRateLimitWindowMs
      )
    ) {
      return c.json(errorBody("RATE_LIMITED", "Too many requests"), 429);
    }

    return next();
  };
}

export function resetPublicApiSecurityState() {
  rateLimitBuckets.clear();
}
