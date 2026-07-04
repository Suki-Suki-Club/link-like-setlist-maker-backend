import { z } from "@hono/zod-openapi";

export const SongMediaPayloadSchema = z
  .object({
    deezerTrackId: z.number().int().openapi({ example: 2967993121 }),
    title: z.string().openapi({ example: "Dream Believers" }),
    artistName: z.string().openapi({ example: "蓮ノ空女学院スクールアイドルクラブ" }),
    albumTitle: z.string().nullable().openapi({ example: "Dream Believers" }),
    duration: z.number().int().nullable().openapi({ example: 284 }),
    coverUrl: z.string().url().openapi({ example: "https://e-cdns-images.dzcdn.net/images/cover/example.jpg" }),
    previewUrl: z.string().url().openapi({ example: "https://cdnt-preview.dzcdn.net/example.mp3" }),
    trackLink: z.string().url().nullable().openapi({ example: "https://www.deezer.com/track/2967993121" }),
    isrc: z.string().nullable().openapi({ example: "JPI102300038" }),
    rank: z.number().int().nullable().openapi({ example: 12345 })
  })
  .openapi("SongMediaPayload");

export const SongMediaResponseSchema = z
  .object({
    songId: z.string().openapi({ example: "dream-believers" }),
    status: z.enum(["available", "unavailable"]).openapi({ example: "available" }),
    media: SongMediaPayloadSchema.nullable()
  })
  .openapi("SongMediaResponse");
