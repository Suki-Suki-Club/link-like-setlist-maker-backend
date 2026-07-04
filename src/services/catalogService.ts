import { AppError } from "../errors.js";
import {
  findSongById,
  listSongs as listSongsFromRepository,
  listUnits as listUnitsFromRepository
} from "../repositories/catalogRepository.js";
import { getPersistedSongMediaBySongIds } from "./songMediaService.js";

export async function listUnits() {
  return listUnitsFromRepository();
}

export async function listSongs(filters: { q?: string; unitId?: string }) {
  return listSongsFromRepository({
    q: filters.q?.trim() || undefined,
    unitId: filters.unitId?.trim() || undefined
  });
}

export async function getSong(id: string) {
  const song = await findSongById(id);

  if (!song) {
    throw new AppError(404, "NOT_FOUND", "Song not found");
  }

  return song;
}

export async function getCatalogBootstrap() {
  const songs = await listSongs({ q: undefined, unitId: undefined });
  const mediaBySongId = await getPersistedSongMediaBySongIds(songs.map((song) => song.id));

  return {
    songs,
    mediaBySongId
  };
}
