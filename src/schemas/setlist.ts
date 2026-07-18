import { z } from "@hono/zod-openapi";

export const SetlistItemInputSchema = z
  .object({
    songId: z.string().min(1).openapi({ example: "dream-believers" })
  })
  .openapi("SetlistItemInput");

export const SetlistCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).openapi({ example: "Opening block" }),
    description: z.string().trim().max(1000).optional().openapi({ example: "Two song flow" }),
    items: z.array(SetlistItemInputSchema).max(100).optional()
  })
  .openapi("SetlistCreateRequest");

export const SetlistParamsSchema = z.object({
  id: z.string().min(1).openapi({
    param: {
      name: "id",
      in: "path"
    },
    example: "clx0000000000000000000000"
  })
});

export const SetlistItemSchema = z
  .object({
    songId: z.string(),
    position: z.number().int().positive()
  })
  .openapi("SetlistItem");

export const SetlistSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    items: z.array(SetlistItemSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .openapi("Setlist");

export const SetlistResponseSchema = z
  .object({
    setlist: SetlistSchema
  })
  .openapi("SetlistResponse");
