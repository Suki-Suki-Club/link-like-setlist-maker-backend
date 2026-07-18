import type { SongWithUnit, UnitWithSeries } from "../repositories/catalogRepository.js";

export function presentSeries(series: { id: string; name: string; sortOrder: number }) {
  return {
    id: series.id,
    name: series.name,
    sortOrder: series.sortOrder
  };
}

export function presentUnit(unit: UnitWithSeries) {
  return {
    id: unit.id,
    name: unit.name,
    seriesId: unit.seriesId,
    sortOrder: unit.sortOrder,
    series: presentSeries(unit.series)
  };
}

export function presentSong(song: SongWithUnit) {
  return {
    id: song.id,
    title: song.title,
    titleJa: song.titleJa,
    unitId: song.unitId,
    sortOrder: song.sortOrder,
    releaseDate: song.releaseDate ? song.releaseDate.toISOString().slice(0, 10) : null,
    unit: presentUnit(song.unit)
  };
}
