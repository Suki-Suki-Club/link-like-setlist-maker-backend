import type { Fetcher } from "../fetcher.js";

export type ScrapedTrack = {
  discNo: number;
  trackNo: number;
  title: string;
  /** 「歌：…」クレジット。トラック単位の記載がない場合は null(リリースの artistCredit を使う) */
  performerCredit: string | null;
};

export type ScrapedRelease = {
  /** シリーズ内で安定なリリース識別子(例: "cd:01_6071") */
  key: string;
  title: string;
  url: string;
  /** ISO 形式 (YYYY-MM-DD)。読み取れない場合は null */
  releaseDate: string | null;
  /** 詳細ページの「アーティスト」欄 */
  artistCredit: string | null;
  tracks: ScrapedTrack[];
};

export interface SeriesScraper {
  seriesId: string;
  scrape(fetcher: Fetcher): Promise<ScrapedRelease[]>;
}
