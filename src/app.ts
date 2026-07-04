import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { AppError, errorBody } from "./errors.js";
import { createPublicApiSecurityMiddleware } from "./middleware/security.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSetlistRoutes } from "./routes/setlists.js";
import { createRuntimeMiddleware } from "./runtime.js";
import type { AppEnv } from "./supabaseServer.js";

const app = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(errorBody("VALIDATION_ERROR", "Request validation failed", result.error.flatten()), 400);
    }
  }
});

app.use("*", createRuntimeMiddleware());
app.use(
  "*",
  cors({
    origin: () => config.corsOrigin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: false
  })
);
app.use("*", createPublicApiSecurityMiddleware());

registerHealthRoutes(app);
registerCatalogRoutes(app);
registerSetlistRoutes(app);

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "Link Like Setlist Maker API",
    version: "1.0.0",
    description: "Backend API for catalog lookup and setlist sharing."
  }
});

app.get("/docs", swaggerUI({ url: "/openapi.json" }));

app.notFound((c) => c.json(errorBody("NOT_FOUND", "Route not found"), 404));

app.onError((error, c) => {
  if (error instanceof AppError) {
    return c.json(errorBody(error.code, error.message, error.details), error.status);
  }

  console.error(error);
  return c.json(errorBody("INTERNAL_SERVER_ERROR", "Unexpected server error"), 500);
});

export default app;
