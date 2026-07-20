import * as cheerio from "cheerio";
import { parseJapaneseDate } from "../normalize.js";
import type { Fetcher } from "../fetcher.js";
import type { ScrapedRelease, ScrapedTrack, SeriesScraper } from "./types.js";

const BASE_URL = "https://www.lovelive-anime.jp/yuigaoka/music/";

type ListEntry = {
  key: string;
  url: string;
  listTitle: string;
  listDate: string | null;
};

export function parseListPage(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const entries: ListEntry[] = [];

  $("li > a[href]").each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href") ?? "";
    // 新 CMS: detail.php?p=01_XXXX / 旧形式: cdNN.php
    const pageId = href.match(/detail\.php\?p=([\w-]+)/)?.[1];
    const legacyId = href.match(/^(cd\d+)\.php$/)?.[1];

    if (!pageId && !legacyId) {
      return;
    }

    entries.push({
      key: `cd:${pageId ?? legacyId}`,
      url: pageId ? `${BASE_URL}detail.php?p=${pageId}` : `${BASE_URL}${legacyId}.php`,
      listTitle: anchor.find("p.title").text().trim(),
      listDate: parseJapaneseDate(anchor.find("p.date").text())
    });
  });

  return entries;
}

/**
 * 「01.曲名」行 + 「歌：…」行(複数 <small> 行に折り返されることがある)を解析する。
 * 直前の歌クレジットが「、」で終わっている場合、次の行を継続として連結する。
 */
export function parseTrackListText(text: string): ScrapedTrack[] {
  const tracks: ScrapedTrack[] = [];
  let current: ScrapedTrack | null = null;
  let creditContinues = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/^[\s　]+/, "").trim();

    // <br/> 置換と元 HTML の改行が重なって空行ができるため、空行では継続状態を維持する
    if (!line) {
      continue;
    }

    const trackMatch = line.match(/^(\d{1,3})[.．]\s*(.+)$/);

    if (trackMatch) {
      current = {
        discNo: 1,
        trackNo: Number(trackMatch[1]),
        title: trackMatch[2].trim(),
        performerCredit: null
      };
      tracks.push(current);
      creditContinues = false;
      continue;
    }

    const performerMatch = line.match(/^歌[:：]\s*(.+)$/);

    if (performerMatch && current) {
      current.performerCredit = performerMatch[1].trim();
      creditContinues = current.performerCredit.endsWith("、");
      continue;
    }

    if (creditContinues && current?.performerCredit && !/^(作詞|作曲|編曲|※)/.test(line)) {
      current.performerCredit += line;
      creditContinues = current.performerCredit.endsWith("、");
      continue;
    }

    creditContinues = false;
  }

  return tracks;
}

export function parseDetailPage(html: string, entry: ListEntry): ScrapedRelease {
  const $ = cheerio.load(html);

  const titleNode = $("div.box .title p").first();
  const lead = titleNode.find("span.subname").text().trim();
  const main = titleNode.clone().children("span").remove().end().text().trim();
  const title = [lead, main].filter(Boolean).join(" ") || entry.listTitle;

  let artistCredit: string | null = null;
  let releaseDate: string | null = null;

  $("dl.spec dt").each((_, dt) => {
    const label = $(dt).text().trim();
    const value = $(dt).nextUntil("dt").filter("dd").first().text().trim();

    if (label.includes("アーティスト")) {
      artistCredit = value.replace(/[\s　]+/g, " ").trim() || null;
    } else if (label.includes("発売日")) {
      releaseDate = parseJapaneseDate(value);
    }
  });

  const tracks: ScrapedTrack[] = [];

  // 新 CMS: 「収録内容」見出し(p.media)直後の p.list にトラックが並ぶ
  $("p.media").each((_, media) => {
    if (!$(media).text().includes("収録内容")) {
      return;
    }

    const listParagraph = $(media).nextAll("p.list").first();
    const text = cheerio
      .load((listParagraph.html() ?? "").replace(/<br\s*\/?>/gi, "\n"))
      .text();
    tracks.push(...parseTrackListText(text));
  });

  // 旧形式 (cdNN.php): 虹ヶ咲と同じ ul.track > li + 内側 dl の 歌：
  $("ul.track > li").each((_, item) => {
    const li = $(item);
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

    li.find("dl dt").each((__, dt) => {
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

  return {
    key: entry.key,
    title,
    url: entry.url,
    releaseDate: releaseDate ?? entry.listDate,
    artistCredit,
    tracks
  };
}

export const yuigaokaScraper: SeriesScraper = {
  seriesId: "liella",
  async scrape(fetcher: Fetcher): Promise<ScrapedRelease[]> {
    const listHtml = await fetcher.fetchPage(BASE_URL);
    const entries = parseListPage(listHtml);

    if (entries.length === 0) {
      throw new Error("yuigaoka music list yielded no entries — the site structure may have changed");
    }

    const releases: ScrapedRelease[] = [];

    for (const entry of entries) {
      const detailHtml = await fetcher.fetchPage(entry.url);
      releases.push(parseDetailPage(detailHtml, entry));
    }

    return releases;
  }
};
