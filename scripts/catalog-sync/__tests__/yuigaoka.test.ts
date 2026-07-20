import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDetailPage, parseListPage } from "../scrapers/yuigaoka.js";

const fixturesDir = join(__dirname, "..", "__fixtures__");

describe("yuigaoka (Liella!) scraper", () => {
  it("parses the music list into detail entries", () => {
    const entries = parseListPage(readFileSync(join(fixturesDir, "liella-music-list.html"), "utf8"));

    expect(entries.length).toBeGreaterThan(50);
    expect(entries[0].url).toContain("yuigaoka/music/detail.php?p=");
    expect(entries.some((entry) => entry.listDate === "2026-07-08")).toBe(true);
  });

  it("parses a legacy cdNN.php detail page with ul.track markup", () => {
    const release = parseDetailPage(
      readFileSync(join(fixturesDir, "liella-detail-cd49.html"), "utf8"),
      { key: "cd:cd49", url: "https://example.test", listTitle: "", listDate: null }
    );

    expect(release.tracks.length).toBeGreaterThan(3);
    expect(release.tracks.some((track) => track.performerCredit === "Liella!")).toBe(true);
    expect(
      release.tracks.some((track) => track.performerCredit?.includes("ウィーン・マルガレーテ"))
    ).toBe(true);
  });

  it("parses a detail page with wrapped multi-line performer credits", () => {
    const release = parseDetailPage(
      readFileSync(join(fixturesDir, "liella-detail-01_5918.html"), "utf8"),
      { key: "cd:01_5918", url: "https://example.test", listTitle: "", listDate: null }
    );

    expect(release.title).toContain("Hyper Glowing");
    expect(release.tracks.length).toBeGreaterThanOrEqual(4);
    expect(release.tracks[0]).toMatchObject({ trackNo: 1, title: "Hyper Glowing！", performerCredit: "Liella!" });

    // 「歌：澁谷かのん（CV.伊達さゆり）、唐 可可（CV.Liyuu）、」+ 続き行が連結されること
    const wrapped = release.tracks.find((track) => track.performerCredit?.includes("澁谷かのん"));
    expect(wrapped).toBeDefined();
    expect(wrapped!.performerCredit!.endsWith("、")).toBe(false);
  });
});
