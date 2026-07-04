import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import { AppError } from "../errors.js";
import { presentSong, presentUnit } from "../presenters/catalogPresenter.js";
import {
  SongParamsSchema,
  SongResponseSchema,
  SongsQuerySchema,
  SongsResponseSchema,
  UnitsResponseSchema,
  CatalogBootstrapResponseSchema
} from "../schemas/catalog.js";
import { ErrorResponseSchema } from "../schemas/error.js";
import { SongMediaResponseSchema } from "../schemas/songMedia.js";
import { getCatalogBootstrap, getSong, listSongs, listUnits } from "../services/catalogService.js";
import { getSongMedia } from "../services/songMediaService.js";
import type { AppEnv } from "../supabaseServer.js";

const listUnitsRoute = createRoute({
  method: "get",
  path: "/api/units",
  tags: ["Catalog"],
  responses: {
    200: {
      description: "Seeded units",
      content: {
        "application/json": {
          schema: UnitsResponseSchema
        }
      }
    }
  }
});

const listSongsRoute = createRoute({
  method: "get",
  path: "/api/songs",
  tags: ["Catalog"],
  request: {
    query: SongsQuerySchema
  },
  responses: {
    200: {
      description: "Seeded songs",
      content: {
        "application/json": {
          schema: SongsResponseSchema
        }
      }
    }
  }
});

const getSongRoute = createRoute({
  method: "get",
  path: "/api/songs/{id}",
  tags: ["Catalog"],
  request: {
    params: SongParamsSchema
  },
  responses: {
    200: {
      description: "Song by id",
      content: {
        "application/json": {
          schema: SongResponseSchema
        }
      }
    },
    404: {
      description: "Song not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

const getCatalogBootstrapRoute = createRoute({
  method: "get",
  path: "/api/catalog/bootstrap",
  tags: ["Catalog"],
  responses: {
    200: {
      description: "Seeded songs and media metadata for the setlist maker entry screen",
      content: {
        "application/json": {
          schema: CatalogBootstrapResponseSchema
        }
      }
    }
  }
});

const getSongMediaRoute = createRoute({
  method: "get",
  path: "/api/song-media/{id}",
  tags: ["Catalog"],
  request: {
    params: SongParamsSchema
  },
  responses: {
    200: {
      description: "Read-only media metadata for a seeded song",
      content: {
        "application/json": {
          schema: SongMediaResponseSchema
        }
      }
    },
    404: {
      description: "Song not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema
        }
      }
    }
  }
});

export function registerCatalogRoutes(app: OpenAPIHono<AppEnv>) {
  app.openapi(listUnitsRoute, async (c) => {
    const units = await listUnits();
    return c.json({ units: units.map(presentUnit) }, 200);
  });

  app.openapi(listSongsRoute, async (c) => {
    const query = c.req.valid("query");
    const songs = await listSongs(query);
    return c.json({ songs: songs.map(presentSong) }, 200);
  });

  app.openapi(getCatalogBootstrapRoute, async (c) => {
    const bootstrap = await getCatalogBootstrap();

    return c.json(
      {
        songs: bootstrap.songs.map(presentSong),
        mediaBySongId: bootstrap.mediaBySongId
      },
      200
    );
  });

  app.openapi(getSongMediaRoute, async (c) => {
    const { id } = c.req.valid("param");
    const media = await getSongMedia(id);

    return c.json(media, 200);
  });

  app.openapi(getSongRoute, async (c) => {
    const { id } = c.req.valid("param");
    const song = await getSong(id).catch((error: unknown) => {
      if (error instanceof AppError) {
        throw error;
      }
      throw error;
    });

    return c.json({ song: presentSong(song) }, 200);
  });
}
