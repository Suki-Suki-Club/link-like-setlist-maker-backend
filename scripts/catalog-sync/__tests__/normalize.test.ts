import { describe, expect, it } from "vitest";
import {
  buildCatalogCandidates,
  createTrackExcluder,
  normalizeTitleKey,
  parseDotDate,
  parseJapaneseDate
} from "../normalize.js";
import type { ScrapedRelease } from "../scrapers/types.js";

describe("normalizeTitleKey", () => {
  it("treats full-width and half-width punctuation variants as the same title", () => {
    expect(normalizeTitleKey("ド! ド! ド!")).toBe(normalizeTitleKey("ド！ド！ド！"));
    expect(normalizeTitleKey("On your mark")).toBe(normalizeTitleKey("On Your Mark"));
    expect(normalizeTitleKey("以心☆電信")).toBe(normalizeTitleKey("以心電信"));
  });

  it("keeps distinct titles distinct", () => {
    expect(normalizeTitleKey("水彩世界")).not.toBe(normalizeTitleKey("素敵な世界"));
  });
});

describe("createTrackExcluder", () => {
  const isExcluded = createTrackExcluder();

  it("excludes off-vocal, instrumental, and drama tracks", () => {
    expect(isExcluded("Dream Believers (Off Vocal)")).toBe(true);
    expect(isExcluded("水彩世界（Ｏｆｆ Ｖｏｃａｌ）")).toBe(true);
    expect(isExcluded("スリーズブーケ ドラマパート①")).toBe(true);
    expect(isExcluded("AWOKE -Instrumental-")).toBe(true);
  });

  it("keeps normal songs", () => {
    expect(isExcluded("Dream Believers")).toBe(false);
    expect(isExcluded("ド！ド！ド！")).toBe(false);
  });

  it("supports extra configurable patterns", () => {
    const custom = createTrackExcluder(["ボーナストラック"]);
    expect(custom("ボーナストラック その1")).toBe(true);
  });
});

describe("buildCatalogCandidates", () => {
  const release = (key: string, date: string | null, titles: string[]): ScrapedRelease => ({
    key,
    title: `release ${key}`,
    url: `https://example.test/${key}`,
    releaseDate: date,
    artistCredit: "蓮ノ空女学院スクールアイドルクラブ",
    tracks: titles.map((title, index) => ({
      discNo: 1,
      trackNo: index + 1,
      title,
      performerCredit: null
    }))
  });

  it("dedupes songs across releases and keeps the earliest release date", () => {
    const candidates = buildCatalogCandidates(
      [
        release("cd:2", "2024-06-01", ["Dream Believers", "新曲B"]),
        release("cd:1", "2023-03-29", ["Dream Believers"])
      ],
      () => false
    );

    const dream = candidates.find((candidate) => candidate.title === "Dream Believers");
    expect(dream).toBeDefined();
    expect(dream!.releaseDate).toBe("2023-03-29");
    expect(dream!.sources).toHaveLength(2);
    expect(candidates).toHaveLength(2);
  });

  it("applies the exclusion filter", () => {
    const candidates = buildCatalogCandidates(
      [release("cd:1", "2023-03-29", ["Dream Believers", "Dream Believers (Off Vocal)"])],
      createTrackExcluder()
    );

    expect(candidates).toHaveLength(1);
  });
});

describe("date parsing", () => {
  it("parses Japanese dates", () => {
    expect(parseJapaneseDate("2026年7月1日（水）")).toBe("2026-07-01");
    expect(parseJapaneseDate("発売日不明")).toBeNull();
  });

  it("parses dotted dates", () => {
    expect(parseDotDate("2026.05.09")).toBe("2026-05-09");
    expect(parseDotDate("May 9")).toBeNull();
  });
});
