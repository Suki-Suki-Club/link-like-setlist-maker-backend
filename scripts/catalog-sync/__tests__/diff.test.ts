import { describe, expect, it } from "vitest";
import { diffCatalog } from "../diff.js";
import { normalizeTitleKey, type CatalogCandidate } from "../normalize.js";
import { appendNewSongs, serializeSongs } from "../emit.js";

const candidate = (title: string, releaseDate: string | null = null): CatalogCandidate => ({
  titleKey: normalizeTitleKey(title),
  title,
  releaseDate,
  performerCredit: "スリーズブーケ",
  sources: [{ releaseKey: "cd:1", releaseTitle: "release", url: "https://example.test" }]
});

const songs = [
  {
    id: "do-do-do",
    title: "ド! ド! ド!",
    titleJa: "ド! ド! ド!",
    unitId: "solo",
    sortOrder: 1,
    releaseDate: "2024-01-01",
    deezerTrackId: 1
  },
  {
    id: "dream-believers",
    title: "Dream Believers",
    titleJa: "Dream Believers",
    unitId: "hasunosora",
    sortOrder: 2,
    releaseDate: "2023-03-29",
    deezerTrackId: 2
  }
];

describe("diffCatalog", () => {
  it("matches existing songs despite punctuation differences and never re-adds them", () => {
    const diff = diffCatalog([candidate("ド！ド！ド！"), candidate("新曲X")], songs);

    expect(diff.matchedCount).toBe(1);
    expect(diff.newCandidates.map((entry) => entry.title)).toEqual(["新曲X"]);
    expect(diff.missingFromSite.map((song) => song.id)).toEqual(["dream-believers"]);
  });
});

describe("appendNewSongs", () => {
  it("appends new songs after existing ones with sequential sortOrder and stable key order", () => {
    const updated = appendNewSongs(songs, [
      {
        candidate: candidate("新曲X", "2026-01-01"),
        id: "shinkyoku-x",
        unitId: "cerise-bouquet",
        match: {
          decision: "auto",
          candidates: [
            {
              trackId: 999,
              title: "新曲X",
              artistName: "スリーズブーケ",
              albumTitle: null,
              link: null,
              score: 1
            }
          ]
        }
      },
      {
        candidate: candidate("新曲Y", "2025-01-01"),
        id: "shinkyoku-y",
        unitId: "cerise-bouquet",
        match: { decision: "review", candidates: [] }
      }
    ]);

    expect(updated.map((song) => song.id)).toEqual([
      "do-do-do",
      "dream-believers",
      "shinkyoku-y",
      "shinkyoku-x"
    ]);
    // 発売日順で sortOrder が振られる
    expect(updated[2].sortOrder).toBe(3);
    expect(updated[3].sortOrder).toBe(4);
    // auto は deezerTrackId が入り、review は null
    expect(updated[3].deezerTrackId).toBe(999);
    expect(updated[2].deezerTrackId).toBeNull();

    const serialized = serializeSongs(updated);
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    expect(Object.keys(parsed[3])).toEqual([
      "id",
      "title",
      "titleJa",
      "unitId",
      "sortOrder",
      "releaseDate",
      "deezerTrackId"
    ]);
  });
});
