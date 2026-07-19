import * as cheerio from "cheerio";
import { parseJapaneseDate } from "../normalize.js";
import type { Fetcher } from "../fetcher.js";
import type { ScrapedRelease, ScrapedTrack, SeriesScraper } from "./types.js";

const PAGE_URL = "https://www.lovelive-anime.jp/nijigasaki/cd.php";

/**
 * 虹ヶ咲は cd.php 1 ページに全リリースが `div.box[id^=cd]` として埋め込まれている。
 * 各 box: .title p (span=作品種別リード + 残りが曲名) / dl.spec (【アーティスト】【発売日】) /
 * ul.track > li ("01. 曲名" + 内側 dl の 歌：)
 */
export function parseCdPage(html: string): ScrapedRelease[] {
  const $ = cheerio.load(html);
  const releases: ScrapedRelease[] = [];

  $("div.box[id^=cd]").each((_, element) => {
    const box = $(element);
    const boxId = box.attr("id") ?? "";

    const titleNode = box.find(".title p").first();
    const lead = titleNode.find("span").first().text().trim();
    const main = titleNode
      .clone()
      .children("span")
      .remove()
      .end()
      .text()
      .trim();
    const title = [lead, main].filter(Boolean).join(" ");

    let artistCredit: string | null = null;
    let releaseDate: string | null = null;

    const spec = box.find("dl.spec").first();
    spec.children("dt").each((__, dt) => {
      const label = $(dt).text().trim();
      const value = $(dt).next("dd").text().trim();

      if (label.includes("アーティスト")) {
        artistCredit = value.replace(/[\s　]+/g, " ").trim() || null;
      } else if (label.includes("発売日")) {
        releaseDate = parseJapaneseDate(value);
      }
    });

    const tracks: ScrapedTrack[] = [];

    box.find("ul.track > li").each((__, item) => {
      const li = $(item);
      // li 直下のテキスト(内側 dl を除く)がトラック番号+曲名
      const headText = li
        .clone()
        .children("dl")
        .remove()
        .end()
        .text()
        .replace(/[\s　]+/g, " ")
        .trim();
      const headMatch = headText.match(/^(\d{1,3})[.．]\s*(.+)$/);

      if (!headMatch) {
        return;
      }

      let performerCredit: string | null = null;

      li.find("dl dt").each((___, dt) => {
        if ($(dt).text().trim().startsWith("歌")) {
          performerCredit = $(dt).next("dd").text().replace(/[\s　]+/g, " ").trim() || null;
        }
      });

      tracks.push({
        discNo: 1,
        trackNo: Number(headMatch[1]),
        title: headMatch[2].trim(),
        performerCredit
      });
    });

    if (tracks.length > 0) {
      releases.push({
        key: `cd:${boxId}`,
        title,
        url: `${PAGE_URL}#${boxId}`,
        releaseDate,
        artistCredit,
        tracks
      });
    }
  });

  return releases;
}

export const nijigasakiScraper: SeriesScraper = {
  seriesId: "nijigasaki",
  async scrape(fetcher: Fetcher): Promise<ScrapedRelease[]> {
    const html = await fetcher.fetchPage(PAGE_URL);
    const releases = parseCdPage(html);

    if (releases.length === 0) {
      throw new Error(
        "nijigasaki cd.php yielded no releases — the site structure may have changed"
      );
    }

    return releases;
  }
};
