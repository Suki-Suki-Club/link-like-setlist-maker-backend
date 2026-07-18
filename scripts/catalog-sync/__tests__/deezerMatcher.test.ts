import { describe, expect, it } from "vitest";
import type { DeezerTrack } from "../../../src/clients/deezerClient.js";
import { matchSongToDeezer, titleSimilarity } from "../deezerMatcher.js";

function track(id: number, title: string, artist: string): DeezerTrack {
  return {
    id,
    title,
    artist: { name: artist },
    album: { title: "album" }
  } as DeezerTrack;
}

describe("titleSimilarity", () => {
  it("is 1 for equivalent normalized titles", () => {
    expect(titleSimilarity("ド！ド！ド！", "ド! ド! ド!")).toBe(1);
  });

  it("is high for near matches and low for unrelated titles", () => {
    expect(titleSimilarity("Dream Believers", "Dream Believers (104期 Ver.)")).toBeGreaterThan(0.6);
    expect(titleSimilarity("Dream Believers", "夏めきペイン")).toBeLessThan(0.2);
  });
});

describe("matchSongToDeezer", () => {
  const input = {
    title: "新曲サンプル",
    unitNames: ["スリーズブーケ"],
    seriesArtists: ["蓮ノ空女学院スクールアイドルクラブ"]
  };

  it("auto-applies an exact title+artist match with clear margin", async () => {
    const result = await matchSongToDeezer(input, {
      intervalMs: 0,
      search: async () => [
        track(100, "新曲サンプル", "スリーズブーケ"),
        track(101, "別の曲", "スリーズブーケ")
      ]
    });

    expect(result.decision).toBe("auto");
    expect(result.candidates[0].trackId).toBe(100);
  });

  it("sends near-misses to review instead of auto-applying", async () => {
    const result = await matchSongToDeezer(input, {
      intervalMs: 0,
      search: async () => [track(200, "新曲サンプル (Off Vocal)", "スリーズブーケ")]
    });

    expect(result.decision).toBe("review");
  });

  it("requires a margin over the runner-up even for high scores", async () => {
    const result = await matchSongToDeezer(input, {
      intervalMs: 0,
      search: async () => [
        track(300, "新曲サンプル", "スリーズブーケ"),
        track(301, "新曲サンプル", "スリーズブーケ")
      ]
    });

    expect(result.decision).toBe("review");
  });

  it("returns none when nothing plausible is found", async () => {
    const result = await matchSongToDeezer(input, {
      intervalMs: 0,
      search: async () => [track(400, "全然違う曲", "unrelated artist")]
    });

    expect(result.decision).toBe("none");
  });

  it("treats the series-level artist credit as a partial artist match", async () => {
    const result = await matchSongToDeezer(input, {
      intervalMs: 0,
      search: async () => [track(500, "新曲サンプル", "蓮ノ空女学院スクールアイドルクラブ")]
    });

    // 0.65 * 1 + 0.35 * 0.6 = 0.86 → review 帯
    expect(result.decision).toBe("review");
    expect(result.candidates[0].score).toBeCloseTo(0.86, 2);
  });
});
