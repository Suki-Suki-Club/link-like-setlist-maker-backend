import { z } from "zod";
import { config } from "../config.js";

const DeezerErrorSchema = z.object({
  error: z.object({
    type: z.string().optional(),
    message: z.string().optional(),
    code: z.number().optional()
  })
});

const DeezerTrackSchema = z.object({
  id: z.number().int(),
  readable: z.boolean().optional(),
  title: z.string(),
  title_short: z.string().optional(),
  title_version: z.string().optional(),
  isrc: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  duration: z.number().int().nullable().optional(),
  rank: z.number().int().nullable().optional(),
  preview: z.string().nullable().optional(),
  artist: z.object({
    id: z.number().int().optional(),
    name: z.string(),
    type: z.string().optional()
  }),
  album: z
    .object({
      id: z.number().int().optional(),
      title: z.string(),
      cover_medium: z.string().nullable().optional(),
      cover_big: z.string().nullable().optional(),
      cover_xl: z.string().nullable().optional(),
      type: z.string().optional()
    })
    .nullable()
    .optional(),
  type: z.string().optional()
});

export type DeezerTrack = z.infer<typeof DeezerTrackSchema>;

async function requestJson(path: string) {
  const url = new URL(path, config.deezerApiBaseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.deezerRequestTimeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Deezer request failed with status ${response.status}`);
    }

    const json = (await response.json()) as unknown;
    const error = DeezerErrorSchema.safeParse(json);
    if (error.success) {
      throw new Error(error.data.error.message ?? "Deezer API returned an error");
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getDeezerTrack(trackId: number) {
  const json = await requestJson(`/track/${trackId}`);
  return DeezerTrackSchema.parse(json);
}
