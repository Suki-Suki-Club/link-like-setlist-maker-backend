import { searchDeezerTracks, type DeezerTrack } from "../../src/clients/deezerClient.js";
import { normalizeTitleKey } from "./normalize.js";
import { normalizeCreditKey } from "./unitResolver.js";

export type MatcherThresholds = {
  autoApplyScore: number;
  autoApplyMargin: number;
  reviewScore: number;
};

export const DEFAULT_THRESHOLDS: MatcherThresholds = {
  autoApplyScore: 0.9,
  autoApplyMargin: 0.15,
  reviewScore: 0.6
};

export type MatchCandidate = {
  trackId: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  link: string | null;
  score: number;
};

export type MatchResult = {
  /** auto: 自動採用 / review: 人間レビュー行き / none: マッチなし */
  decision: "auto" | "review" | "none";
  candidates: MatchCandidate[];
};

function bigrams(text: string): Set<string> {
  const grams = new Set<string>();

  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }

  return grams;
}

/** バイグラム Dice 係数によるタイトル類似度 (0-1) */
export function titleSimilarity(a: string, b: string): number {
  const keyA = normalizeTitleKey(a);
  const keyB = normalizeTitleKey(b);

  if (!keyA || !keyB) {
    return 0;
  }

  if (keyA === keyB) {
    return 1;
  }

  if (keyA.length < 2 || keyB.length < 2) {
    return keyA === keyB ? 1 : 0;
  }

  const gramsA = bigrams(keyA);
  const gramsB = bigrams(keyB);
  let shared = 0;

  for (const gram of gramsA) {
    if (gramsB.has(gram)) {
      shared += 1;
    }
  }

  return (2 * shared) / (gramsA.size + gramsB.size);
}

function artistScore(deezerArtist: string, unitNames: string[], seriesArtists: string[]): number {
  const artistKey = normalizeCreditKey(deezerArtist);

  for (const unitName of unitNames) {
    if (artistKey === normalizeCreditKey(unitName)) {
      return 1;
    }
  }

  for (const seriesArtist of seriesArtists) {
    const seriesKey = normalizeCreditKey(seriesArtist);

    if (artistKey === seriesKey || artistKey.includes(seriesKey) || seriesKey.includes(artistKey)) {
      return 0.6;
    }
  }

  return 0;
}

// Deezer の /search はアルバム発売日を返さないため、発売年の近接は使わず
// タイトル類似度とアーティスト一致の 2 要素で採点する
const TITLE_WEIGHT = 0.65;
const ARTIST_WEIGHT = 0.35;

export function scoreTrack(
  track: DeezerTrack,
  songTitle: string,
  unitNames: string[],
  seriesArtists: string[]
): number {
  return (
    TITLE_WEIGHT * titleSimilarity(track.title, songTitle) +
    ARTIST_WEIGHT * artistScore(track.artist.name, unitNames, seriesArtists)
  );
}

export type SearchFn = (query: string) => Promise<DeezerTrack[]>;

export async function matchSongToDeezer(
  input: {
    title: string;
    /** 照合に使うユニット名(正名とエイリアス) */
    unitNames: string[];
    /** シリーズ級のアーティスト名義(フランチャイズ名義対策) */
    seriesArtists: string[];
  },
  options: {
    search?: SearchFn;
    thresholds?: MatcherThresholds;
    intervalMs?: number;
  } = {}
): Promise<MatchResult> {
  const search = options.search ?? ((query) => searchDeezerTracks(query));
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const intervalMs = options.intervalMs ?? 1100;

  const primaryArtist = input.unitNames[0];
  const queries = [
    primaryArtist ? `track:"${input.title}" artist:"${primaryArtist}"` : null,
    primaryArtist ? `${input.title} ${primaryArtist}` : null,
    input.title
  ].filter((query): query is string => query !== null);

  const seenTrackIds = new Set<number>();
  const candidates: MatchCandidate[] = [];

  for (const [index, query] of queries.entries()) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    let tracks: DeezerTrack[];

    try {
      tracks = await search(query);
    } catch {
      // 検索段ごとの失敗は握りつぶして次のクエリへ(全滅なら none 判定になる)
      continue;
    }

    for (const track of tracks) {
      if (seenTrackIds.has(track.id)) {
        continue;
      }

      seenTrackIds.add(track.id);
      candidates.push({
        trackId: track.id,
        title: track.title,
        artistName: track.artist.name,
        albumTitle: track.album?.title ?? null,
        link: track.link ?? null,
        score: scoreTrack(track, input.title, input.unitNames, input.seriesArtists)
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    // 高確信度のマッチが得られたら以降のクエリは投げない(API 負荷削減)
    if (candidates[0] && candidates[0].score >= thresholds.autoApplyScore) {
      break;
    }
  }

  const top = candidates[0];

  if (!top || top.score < thresholds.reviewScore) {
    return { decision: "none", candidates: candidates.slice(0, 3) };
  }

  const runnerUp = candidates[1];
  const margin = runnerUp ? top.score - runnerUp.score : 1;

  if (top.score >= thresholds.autoApplyScore && margin >= thresholds.autoApplyMargin) {
    return { decision: "auto", candidates: candidates.slice(0, 3) };
  }

  return { decision: "review", candidates: candidates.slice(0, 3) };
}
