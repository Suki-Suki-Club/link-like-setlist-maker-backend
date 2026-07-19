import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCdPage } from "../scrapers/nijigasaki.js";

const html = readFileSync(join(__dirname, "..", "__fixtures__", "nijigasaki-cd.html"), "utf8");

describe("nijigasaki scraper", () => {
  const releases = parseCdPage(html);

  it("parses every cd box that has a tracklist", () => {
    expect(releases.length).toBeGreaterThan(50);
    expect(releases.every((release) => /^cd:cd\d+/.test(release.key))).toBe(true);
  });

  it("parses title, artist, date, and per-track credits", () => {
    const eternalize = releases.find((release) => release.key === "cd:cd82");
    expect(eternalize).toBeDefined();
    expect(eternalize!.title).toContain("Eternalize Love!!");
    expect(eternalize!.releaseDate).toBe("2025-05-14");
    expect(eternalize!.artistCredit).toBe("虹ヶ咲学園スクールアイドル同好会");

    const first = eternalize!.tracks[0];
    expect(first).toMatchObject({
      trackNo: 1,
      title: "Eternalize Love!!",
      performerCredit: "虹ヶ咲学園スクールアイドル同好会"
    });

    const soloVer = eternalize!.tracks.find((track) => track.title.includes("上原歩夢 Solo Ver."));
    expect(soloVer?.performerCredit).toBe("上原歩夢(CV.大西亜玖璃)");
  });
});
