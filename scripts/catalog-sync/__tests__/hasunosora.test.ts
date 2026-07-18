import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseDetailPage,
  parseListPage,
  parseSidebarProductLinks
} from "../scrapers/hasunosora.js";

const fixturesDir = join(__dirname, "..", "__fixtures__", "hasunosora");

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("hasunosora scraper", () => {
  it("parses the CD list page into detail entries", () => {
    const entries = parseListPage(fixture("cd-list.html"), "cd");

    expect(entries.length).toBeGreaterThan(30);
    expect(entries[0].key).toMatch(/^cd:01_/);
    expect(entries[0].url).toContain("https://www.lovelive-anime.jp/hasunosora/music/cd/?p=");
    expect(entries.every((entry) => entry.listDate === null || /^\d{4}-\d{2}-\d{2}$/.test(entry.listDate))).toBe(true);
  });

  it("parses the streaming list page", () => {
    const entries = parseListPage(fixture("str-list.html"), "str");

    expect(entries.length).toBe(4);
    expect(entries.some((entry) => entry.listTitle.includes("雪舞う空と二秒の永遠"))).toBe(true);
  });

  it("parses a CD detail page with discs, tracks, and per-track performer credits", () => {
    const entries = parseListPage(fixture("cd-list.html"), "cd");
    const entry = entries.find((candidate) => candidate.key === "cd:01_6071");
    expect(entry).toBeDefined();

    const release = parseDetailPage(fixture("cd-detail-01_6071.html"), entry!);

    expect(release.title).toContain("Full Bloom Memories");
    expect(release.releaseDate).toBe("2026-07-01");
    expect(release.artistCredit).toContain("大沢瑠璃乃");

    const doDoDo = release.tracks.find((track) => track.title === "ド！ド！ド！");
    expect(doDoDo).toBeDefined();
    expect(doDoDo!.discNo).toBe(1);
    expect(doDoDo!.trackNo).toBe(1);
    expect(doDoDo!.performerCredit).toBe("大沢瑠璃乃(CV.菅 叶和)");

    const disc2 = release.tracks.filter((track) => track.discNo === 2);
    expect(disc2.length).toBeGreaterThan(0);
    expect(disc2[0].title).toBe("みらくりえーしょん");

    // 作詞・作曲行がトラックとして混入していないこと
    expect(release.tracks.every((track) => !/^作詞|^作曲|^編曲/.test(track.title))).toBe(true);
  });

  it("discovers legacy numbered product pages from the sidebar", () => {
    const entries = parseSidebarProductLinks(fixture("cd-list.html"));

    expect(entries.length).toBeGreaterThan(25);
    expect(entries[0]).toMatchObject({
      key: "product:01",
      url: "https://www.lovelive-anime.jp/hasunosora/music/01/"
    });
  });

  it("parses a legacy product page using the ol/li head+small markup", () => {
    const release = parseDetailPage(fixture("product-01.html"), {
      key: "product:01",
      url: "https://www.lovelive-anime.jp/hasunosora/music/01/",
      listTitle: "",
      listDate: null
    });

    expect(release.title).toContain("Dream Believers");
    expect(release.releaseDate).toBe("2023-03-29");
    expect(release.tracks.length).toBeGreaterThanOrEqual(6);
    expect(release.tracks[0]).toMatchObject({
      trackNo: 1,
      title: "Dream Believers",
      performerCredit: "蓮ノ空女学院スクールアイドルクラブ"
    });
    expect(release.tracks.some((track) => track.title === "水彩世界")).toBe(true);
  });

  it("parses a bundled digital release whose tracks sit in a heading-less block", () => {
    const release = parseDetailPage(fixture("str-detail-01_6117.html"), {
      key: "str:01_6117",
      url: "https://www.lovelive-anime.jp/hasunosora/music/str/?p=01_6117",
      listTitle: "",
      listDate: "2026-05-09"
    });

    // Off Vocal 版も同ページに載るが、それらは normalize 側の除外規則で落とす
    expect(release.tracks.slice(0, 4).map((track) => track.title)).toEqual([
      "Berry Merry Go Round",
      "フリジア",
      "PANAI☆",
      "咲かnow!"
    ]);
    expect(release.tracks[0].performerCredit).toBe("スリーズブーケ");
    expect(release.tracks[3].performerCredit).toBe("Edel Note");
  });

  it("includes the head lead in the release title so soundtrack exclusion can match", () => {
    const entries = parseListPage(fixture("cd-list.html"), "cd");
    const entry = entries.find((candidate) => candidate.key === "cd:01_6071");
    const release = parseDetailPage(fixture("cd-detail-01_6071.html"), entry!);

    expect(release.title).toContain("103rd Graduation Album");
  });

  it("parses a digital-only detail page where tracks have no per-track credit", () => {
    const entries = parseListPage(fixture("str-list.html"), "str");
    const entry = entries.find((candidate) => candidate.key === "str:01_5657");
    expect(entry).toBeDefined();

    const release = parseDetailPage(fixture("str-detail-01_5657.html"), entry!);

    expect(release.releaseDate).toBe("2025-12-29");
    expect(release.tracks).toHaveLength(1);
    expect(release.tracks[0].title).toBe("雪舞う空と二秒の永遠");
    expect(release.tracks[0].performerCredit).toBeNull();
    expect(release.artistCredit).toContain("蓮ノ空女学院スクールアイドルクラブ");
  });
});
