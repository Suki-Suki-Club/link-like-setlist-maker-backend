import type { ScrapedRelease } from "./scrapers/types.js";

/**
 * タイトル照合用の正規化。表記ゆれ(全角/半角、空白、記号の有無)を吸収して
 * songs.json 側と公式サイト側を同じキーに落とす。表示用文字列には使わない。
 */
export function normalizeTitleKey(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[!！?？。、,.'’"”~〜・:：;；☆★♪]/g, "");
}

/**
 * 公式サイトはタイトル末尾に「（『作品名』テーマソング）」のようなタイアップ注記を
 * 付けることがある。曲名そのものではないので、候補化の前に取り除く。
 */
export function cleanScrapedTitle(title: string): string {
  return title
    .replace(
      /[（(][^（）()]*(テーマソング|テーマ曲|主題歌|主題曲|挿入歌|イメージソング|Blu-ray|封入特典|特装限定版|Single|シングル|コラボソング)[^（）()]*[）)]\s*$/u,
      ""
    )
    .replace(
      /[【\[][^【】\[\]]*(テーマソング|主題歌|挿入歌|イメージソング|コラボ|Single|シングル)[^【】\[\]]*[】\]]\s*$/u,
      ""
    )
    .trim();
}

const DEFAULT_EXCLUDE_PATTERNS = [
  "off\\s*vocal",
  "オフヴォーカル",
  "instrumental",
  "カラオケ",
  "ドラマパート",
  "ドラマ\\s*part",
  "drama\\s*part",
  "オリジナルドラマ",
  "ボイスドラマ",
  "オーディオドラマ",
  "^(オープニング|エンディング)?トーク",
  "キャストコメント",
  "\\bmc\\b",
  "solo\\s*ver\\.",
  "ソロver",
  "リミックス",
  "\\bremix\\b",
  "promotion\\s*video",
  "making\\s*of",
  "dance\\s*video"
];

export function createTrackExcluder(extraPatterns: string[] = []) {
  const patterns = [...DEFAULT_EXCLUDE_PATTERNS, ...extraPatterns].map(
    (pattern) => new RegExp(pattern, "i")
  );

  return (title: string) => {
    const normalized = title.normalize("NFKC");
    return patterns.some((pattern) => pattern.test(normalized));
  };
}

export type CatalogCandidate = {
  titleKey: string;
  /** 公式サイト表記のタイトル(最初に出現したもの) */
  title: string;
  /** 最古のリリース日 (YYYY-MM-DD)。不明なら null */
  releaseDate: string | null;
  /** トラック単位の 歌：クレジット、なければリリースの アーティスト欄 */
  performerCredit: string | null;
  /** この曲が確認できたリリース(デバッグ・レビュー用) */
  sources: Array<{ releaseKey: string; releaseTitle: string; url: string }>;
};

/**
 * スクレイプ結果のリリース群を「曲」単位に集約する。
 * 同じ曲が複数 CD に収録される場合は最古の発売日を採用する。
 */
export function buildCatalogCandidates(
  releases: ScrapedRelease[],
  isExcluded: (title: string) => boolean
): CatalogCandidate[] {
  const byKey = new Map<string, CatalogCandidate>();

  const sorted = [...releases].sort((a, b) => {
    const dateA = a.releaseDate ?? "9999-12-31";
    const dateB = b.releaseDate ?? "9999-12-31";
    return dateA.localeCompare(dateB);
  });

  for (const release of sorted) {
    for (const track of release.tracks) {
      const title = cleanScrapedTitle(track.title.trim());

      if (!title || isExcluded(title)) {
        continue;
      }

      const titleKey = normalizeTitleKey(title);

      if (!titleKey) {
        continue;
      }

      const source = {
        releaseKey: release.key,
        releaseTitle: release.title,
        url: release.url
      };
      const existing = byKey.get(titleKey);

      if (existing) {
        existing.sources.push(source);
        if (!existing.performerCredit && track.performerCredit) {
          existing.performerCredit = track.performerCredit;
        }
        continue;
      }

      byKey.set(titleKey, {
        titleKey,
        title,
        releaseDate: release.releaseDate,
        performerCredit: track.performerCredit ?? release.artistCredit,
        sources: [source]
      });
    }
  }

  return Array.from(byKey.values());
}

/** 「2026年7月1日（水）」→「2026-07-01」 */
export function parseJapaneseDate(text: string): string | null {
  const match = text.normalize("NFKC").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** 「2026.05.09」→「2026-05-09」 */
export function parseDotDate(text: string): string | null {
  const match = text.trim().match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
