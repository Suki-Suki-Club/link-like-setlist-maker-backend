import { normalizeTitleKey, type CatalogCandidate } from "./normalize.js";

export type SongSeedEntry = {
  id: string;
  title: string;
  titleJa?: string;
  unitId: string;
  sortOrder: number;
  releaseDate?: string;
  deezerTrackId?: number | null;
};

export type CatalogDiff = {
  /** 公式サイトにあり songs.json にない曲 */
  newCandidates: CatalogCandidate[];
  /** songs.json と照合できた曲数 */
  matchedCount: number;
  /** songs.json にあるが今回のスクレイプで見つからなかった曲(レポート用。削除はしない) */
  missingFromSite: SongSeedEntry[];
};

/**
 * 照合キーは正規化した titleJa(なければ title)。
 * 既存エントリの id や人間が設定した値は絶対に書き換えない。
 */
export function diffCatalog(candidates: CatalogCandidate[], songs: SongSeedEntry[]): CatalogDiff {
  const existingByKey = new Map<string, SongSeedEntry>();

  for (const song of songs) {
    existingByKey.set(normalizeTitleKey(song.titleJa ?? song.title), song);
    existingByKey.set(normalizeTitleKey(song.title), song);
  }

  const newCandidates: CatalogCandidate[] = [];
  const matchedIds = new Set<string>();

  for (const candidate of candidates) {
    const existing = existingByKey.get(candidate.titleKey);

    if (existing) {
      matchedIds.add(existing.id);
    } else {
      newCandidates.push(candidate);
    }
  }

  const missingFromSite = songs.filter((song) => !matchedIds.has(song.id));

  return {
    newCandidates,
    matchedCount: matchedIds.size,
    missingFromSite
  };
}
