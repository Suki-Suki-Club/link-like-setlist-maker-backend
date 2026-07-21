import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCdPage } from "../scrapers/uranohoshi.js";

const html = readFileSync(join(__dirname, "..", "__fixtures__", "aqours-cd.html"), "utf8");

describe("uranohoshi (Aqours) scraper", () => {
  const releases = parseCdPage(html);

  it("parses every box with a tracklist", () => {
    expect(releases.length).toBeGreaterThan(60);
    expect(releases.every((release) => /^cd:cd\d+/.test(release.key))).toBe(true);
  });

  it("parses a solo-artist release with disc splits and no per-track credits", () => {
    const release = releases.find((r) => r.key === "cd:cd96");
    expect(release).toBeDefined();
    expect(release!.releaseDate).toBe("2025-04-17");
    expect(release!.artistCredit).toContain("渡辺 曜");

    const disc2First = release!.tracks.find((track) => track.title === "LIVE with a smile!");
    expect(disc2First?.discNo).toBe(2);
    expect(disc2First?.trackNo).toBe(12);
  });

  it("parses per-track 歌 credits on a three-way split single", () => {
    const release = releases.find((r) => r.title.includes("スプリットシングル"));
    expect(release).toBeDefined();

    const first = release!.tracks[0];
    expect(first).toMatchObject({
      trackNo: 1,
      title: "not ALONE not HITORI",
      performerCredit: "Aqours"
    });
  });

  it("drops non-song sections (ドラマパート/greeting/radio) but keeps ■ボーナストラック", () => {
    const release = releases.find((r) => r.tracks.some((t) => t.title === "突撃！風雲マリンパーク"));
    expect(release).toBeUndefined();

    const bonus = releases.find((r) =>
      r.tracks.some((t) => t.title === "Main theme of Aqours 5th anniversary!!")
    );
    expect(bonus).toBeDefined();
  });

  it("joins multi-line member-combo credits without a trailing separator", () => {
    const release = releases.find((r) =>
      r.tracks.some(
        (track) => track.title === "逃走迷走メビウスループ" && track.performerCredit !== null
      )
    );
    expect(release).toBeDefined();

    const track = release!.tracks.find((t) => t.title === "逃走迷走メビウスループ");
    expect(track?.performerCredit).toBe("松浦果南(CV.諏訪ななか)、黒澤ダイヤ(CV.小宮有紗)、小原鞠莉(CV.鈴木愛奈)");

    const nextTrack = release!.tracks.find((t) => t.title === "Hop? Stop? Nonstop!");
    expect(nextTrack?.performerCredit).toBe("Aqours");
  });
});
