import * as cheerio from "cheerio";
import { parseDotDate, parseJapaneseDate } from "../normalize.js";
import type { Fetcher } from "../fetcher.js";
import type { ScrapedRelease, ScrapedTrack, SeriesScraper } from "./types.js";

const BASE_URL = "https://www.lovelive-anime.jp/hasunosora/music/";

type ListEntry = {
  key: string;
  url: string;
  listTitle: string;
  listDate: string | null;
};

/**
 * 一覧ページのサイドバーにある旧形式の作品ページ (`../01/`〜) を拾う。
 * 2025 年前半以前のリリースは `?p=` 形式の一覧に載らず、この番号ページにしか存在しない。
 */
export function parseSidebarProductLinks(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const numbers = new Set<string>();

  $("a[href]").each((_, element) => {
    const match = ($(element).attr("href") ?? "").match(/^\.\.\/(\d+)\/$/);

    if (match) {
      numbers.add(match[1]);
    }
  });

  return Array.from(numbers)
    .sort((a, b) => Number(a) - Number(b))
    .map((number) => ({
      key: `product:${number}`,
      url: `${BASE_URL}${number}/`,
      listTitle: "",
      listDate: null
    }));
}

export function parseListPage(html: string, category: "cd" | "str"): ListEntry[] {
  const $ = cheerio.load(html);
  const entries: ListEntry[] = [];

  $(".list__content li > a").each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr("href") ?? "";
    const pageId = href.match(/\?p=([\w-]+)/)?.[1];

    if (!pageId) {
      return;
    }

    entries.push({
      key: `${category}:${pageId}`,
      url: `${BASE_URL}${category}/?p=${pageId}`,
      listTitle: anchor.find(".list--title").text().trim(),
      listDate: parseDotDate(anchor.find(".list--desc__date").text())
    });
  });

  return entries;
}

/**
 * `<p class="track">01.\t曲名<br/>歌：…<br/>作詞：…</p>` 形式のブロックを解析する。
 * 配信限定ページはタブなし・行頭全角空白のことがある。
 */
function parseTrackBlock(text: string, discNo: number): ScrapedTrack[] {
  const tracks: ScrapedTrack[] = [];
  let current: ScrapedTrack | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/^[\s　]+/, "").trim();

    if (!line) {
      continue;
    }

    const trackMatch = line.match(/^(\d{1,3})[.．]\s*(.+)$/);

    if (trackMatch) {
      current = {
        discNo,
        trackNo: Number(trackMatch[1]),
        title: trackMatch[2].trim(),
        performerCredit: null
      };
      tracks.push(current);
      continue;
    }

    const performerMatch = line.match(/^歌[:：]\s*(.+)$/);

    if (performerMatch && current) {
      current.performerCredit = performerMatch[1].trim();
    }
  }

  return tracks;
}

export function parseDetailPage(html: string, entry: ListEntry): ScrapedRelease {
  const $ = cheerio.load(html);

  // lead(シリーズ名+作品種別)も含める。サントラ等のリリース単位除外はこのタイトルに対して効く
  const headLead = $(".detail__head .head--title__lead").text().trim();
  const headMain = $(".detail__head .head--title__main").text().trim();
  const headTitle = [headLead, headMain].filter(Boolean).join(" ") || entry.listTitle;

  let artistCredit: string | null = null;
  let releaseDate: string | null = null;
  const tracks: ScrapedTrack[] = [];

  $(".detail__content__spec .spec--block").each((_, element) => {
    const block = $(element);
    const heading = block.find("h4").first().text().trim();
    const textNode = block.find(".spec--block__text").first();

    if (heading === "アーティスト") {
      artistCredit = textNode.text().replace(/[\s　]+/g, " ").trim() || null;
      return;
    }

    if (heading === "発売日") {
      releaseDate = parseJapaneseDate(textNode.text());
      return;
    }

    // トラックリストの見出しは「CD」「収録楽曲」など揺れるため、マークアップの有無で判定する。
    // 新形式 (2025 年後半〜): p.disc / p.track、旧形式 (作品番号ページ): ol > li > p.head + p.small
    const trackParagraphs = block.find("p.track");
    const trackListItems = block.find("ol > li");

    if (trackParagraphs.length > 0) {
      let discNo = 0;

      textNode.children("p").each((__, paragraph) => {
        const p = $(paragraph);

        if (p.hasClass("disc")) {
          const discMatch = p.text().match(/Disc\.?\s*(\d+)/i);
          discNo = discMatch ? Number(discMatch[1]) : discNo + 1;
          return;
        }

        if (!p.hasClass("track")) {
          return;
        }

        // <br> を改行として扱いたいので HTML を加工してからテキスト化する
        const text = cheerio.load(p.html()?.replace(/<br\s*\/?>/gi, "\n") ?? "").text();
        tracks.push(...parseTrackBlock(text, Math.max(discNo, 1)));
      });
      return;
    }

    // 第 3 形式: h4 なしの spec--block__text に生テキスト + <br/> でトラックが並ぶ
    // (例: 映画連動の配信バンドル)。特典リスト等の誤検出を避けるため、
    // トラック番号行に加えて「歌：」行を含むブロックだけを採用する
    if (trackListItems.length === 0) {
      const rawText = cheerio
        .load((textNode.html() ?? "").replace(/<br\s*\/?>/gi, "\n"))
        .text();

      if (/^[\s　]*歌[:：]/m.test(rawText)) {
        tracks.push(...parseTrackBlock(rawText, 1));
      }
      return;
    }

    if (trackListItems.length > 0) {
      trackListItems.each((__, item) => {
        const li = $(item);
        const headMatch = li
          .find("p.head")
          .first()
          .text()
          .trim()
          .match(/^(\d{1,3})[.．]\s*(.+)$/);

        if (!headMatch) {
          return;
        }

        const smallHtml = li.find("p.small").first().html() ?? "";
        const smallText = cheerio.load(smallHtml.replace(/<br\s*\/?>/gi, "\n")).text();
        const performerMatch = smallText
          .split("\n")
          .map((line) => line.trim())
          .find((line) => /^歌[:：]/.test(line));

        tracks.push({
          discNo: 1,
          trackNo: Number(headMatch[1]),
          title: headMatch[2].trim(),
          performerCredit: performerMatch
            ? performerMatch.replace(/^歌[:：]\s*/, "").trim()
            : null
        });
      });
    }
  });

  return {
    key: entry.key,
    title: headTitle,
    url: entry.url,
    releaseDate: releaseDate ?? entry.listDate,
    artistCredit,
    tracks
  };
}

export const hasunosoraScraper: SeriesScraper = {
  seriesId: "hasunosora",
  async scrape(fetcher: Fetcher): Promise<ScrapedRelease[]> {
    const releases: ScrapedRelease[] = [];
    let productEntries: ListEntry[] = [];

    for (const category of ["cd", "str"] as const) {
      const listHtml = await fetcher.fetchPage(`${BASE_URL}${category}/`);
      const entries = parseListPage(listHtml, category);

      if (entries.length === 0) {
        throw new Error(
          `hasunosora ${category} list page yielded no entries — the site structure may have changed`
        );
      }

      if (category === "cd") {
        productEntries = parseSidebarProductLinks(listHtml);

        if (productEntries.length === 0) {
          throw new Error(
            "hasunosora sidebar product links are missing — the site structure may have changed"
          );
        }
      }

      for (const entry of entries) {
        const detailHtml = await fetcher.fetchPage(entry.url);
        releases.push(parseDetailPage(detailHtml, entry));
      }
    }

    for (const entry of productEntries) {
      const detailHtml = await fetcher.fetchPage(entry.url);
      releases.push(parseDetailPage(detailHtml, entry));
    }

    return releases;
  }
};
