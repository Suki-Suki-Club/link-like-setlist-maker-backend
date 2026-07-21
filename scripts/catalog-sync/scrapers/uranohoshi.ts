import * as cheerio from "cheerio";
import { parseJapaneseDate } from "../normalize.js";
import type { Fetcher } from "../fetcher.js";
import type { ScrapedRelease, ScrapedTrack, SeriesScraper } from "./types.js";

const PAGE_URL = "https://www.lovelive-anime.jp/uranohoshi/cd.php";

/**
 * Aqours の各リリースは `<a id="cdNN"></a>` に続く `div.box` として1ページに全件並ぶ。
 * div.text は dt/dd も dl も持たない生テキスト(【ラベル】<br>値<br><br> の繰り返し)で、
 * 【収録内容】セクションだけ "NN.曲名<br><span class="uta">歌：…作詞：…</span><br>" が続く。
 */
function extractLabeledBlock(text: string, label: string): string | null {
  const pattern = new RegExp(`【${label}】\\n([\\s\\S]*?)(?:\\n\\n|$)`);
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

function extractPerformerCredit(utaText: string): string | null {
  const lines = utaText.split("\n").map((line) => line.trim());
  let credit: string | null = null;
  let index = lines.findIndex((line) => /^歌[:：]/.test(line));

  if (index === -1) {
    return null;
  }

  credit = lines[index].replace(/^歌[:：]\s*/, "").trim();

  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];

    if (!line || /^(作詞|作曲|編曲|※|M\d|\d{1,3}[.．])/.test(line)) {
      break;
    }

    credit += line;
  }

  return credit.replace(/[、,]?[\s　]*$/, "").trim() || null;
}

export function parseTrackSection(sectionHtml: string): ScrapedTrack[] {
  const withMarkers = sectionHtml
    .replace(/<span class="uta">/gi, "[[UTA]]")
    .replace(/<\/span>/gi, "[[/UTA]]")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = cheerio.load(withMarkers).text();

  const tracks: ScrapedTrack[] = [];
  let discNo = 1;
  let current: ScrapedTrack | null = null;
  let inUta = false;
  let utaBuffer = "";
  // 「■ラベル」区切り。ドラマパートやラジオ、あいさつ音声など非楽曲セクションは
  // 次の「■」が出るまでトラックとして拾わない(■収録曲・■DiscN・未知ラベルは楽曲扱い)
  let skipSection = false;
  const nonSongSectionPattern = /ドラマパート|ご挨拶|挨拶|ラジオ/;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    const sectionMatch = line.match(/^■\s*(.+)$/);

    if (sectionMatch) {
      skipSection = nonSongSectionPattern.test(sectionMatch[1]);
      continue;
    }

    if (skipSection) {
      continue;
    }

    if (line.includes("[[UTA]]")) {
      inUta = true;
      utaBuffer = line.replace("[[UTA]]", "");
      if (line.includes("[[/UTA]]")) {
        inUta = false;
        utaBuffer = utaBuffer.replace("[[/UTA]]", "");
        if (current) {
          current.performerCredit = extractPerformerCredit(utaBuffer);
        }
      }
      continue;
    }

    if (inUta) {
      if (line.includes("[[/UTA]]")) {
        inUta = false;
        utaBuffer += `\n${line.replace("[[/UTA]]", "")}`;
        if (current) {
          current.performerCredit = extractPerformerCredit(utaBuffer);
        }
      } else {
        utaBuffer += `\n${line}`;
      }
      continue;
    }

    if (!line) {
      continue;
    }

    const discMatch = line.match(/^Disc\.?\s*(\d+)/i);

    if (discMatch) {
      discNo = Number(discMatch[1]);
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
    }
  }

  return tracks;
}

export function parseCdPage(html: string): ScrapedRelease[] {
  const $ = cheerio.load(html);
  const releases: ScrapedRelease[] = [];

  $("a[id^=cd]").each((_, anchor) => {
    const id = $(anchor).attr("id") ?? "";
    const box = $(anchor).nextAll("div.box").first();

    if (box.length === 0) {
      return;
    }

    const titleP = box.find(".llbox p").first();
    const lead = titleP.find("span").first().text().trim();
    const main = titleP.clone().children("span").remove().end().text().replace(/[\s　]+/g, " ").trim();
    const title = [lead, main].filter(Boolean).join(" ");

    const textDiv = box.find("div.text").first();
    const plainText = cheerio
      .load((textDiv.html() ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "))
      .text()
      .replace(/[ \t]+/g, " ");
    // 上と別に、<br> を改行として保持したテキストも作る(セクション抽出用)
    const brText = cheerio.load((textDiv.html() ?? "").replace(/<br\s*\/?>/gi, "\n")).text();

    const artistBlock = extractLabeledBlock(brText, "アーティスト");
    const dateBlock = extractLabeledBlock(brText, "発売日");
    const releaseDate = dateBlock ? parseJapaneseDate(dateBlock) : null;
    const artistCredit = artistBlock ? artistBlock.replace(/\n/g, " ").trim() : null;

    const rawHtml = textDiv.html() ?? "";
    const sectionStart = rawHtml.search(/【収録内容】/);
    let trackSectionHtml = sectionStart === -1 ? "" : rawHtml.slice(sectionStart);

    // 【DVD収録内容】【Blu-ray収録内容】以降は映像特典のトラックリストなので楽曲として拾わない
    const videoSectionStart = trackSectionHtml.search(/【(DVD|Blu-ray|BD)収録内容】/);
    if (videoSectionStart !== -1) {
      trackSectionHtml = trackSectionHtml.slice(0, videoSectionStart);
    }

    const tracks = trackSectionHtml ? parseTrackSection(trackSectionHtml) : [];

    void plainText;

    if (tracks.length > 0) {
      releases.push({
        key: `cd:${id}`,
        title,
        url: `${PAGE_URL}#${id}`,
        releaseDate,
        artistCredit,
        tracks
      });
    }
  });

  return releases;
}

export const uranohoshiScraper: SeriesScraper = {
  seriesId: "aqours",
  async scrape(fetcher: Fetcher): Promise<ScrapedRelease[]> {
    const html = await fetcher.fetchPage(PAGE_URL);
    const releases = parseCdPage(html);

    if (releases.length === 0) {
      throw new Error("uranohoshi cd.php yielded no releases — the site structure may have changed");
    }

    return releases;
  }
};
