import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../supabaseServer.js";

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  responses: {
    200: {
      description: "Health status",
      content: {
        "application/json": {
          schema: z.object({
            status: z.literal("ok")
          })
        }
      }
    }
  }
});

const apiHealthRoute = createRoute({
  method: "get",
  path: "/api/health",
  tags: ["Health"],
  responses: healthRoute.responses,
});

export function registerHealthRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(healthRoute, (c) => c.json({ status: "ok" as const }, 200));
  app.openapi(apiHealthRoute, (c) => c.json({ status: "ok" as const }, 200));
}
