import type { Setlist } from "@prisma/client";

export function presentSetlist(setlist: Setlist) {
  return {
    id: setlist.id,
    title: setlist.title,
    description: setlist.description,
    items: setlist.songIds.map((songId, index) => ({
      songId,
      position: index + 1
    })),
    createdAt: setlist.createdAt.toISOString(),
    updatedAt: setlist.updatedAt.toISOString()
  };
}
