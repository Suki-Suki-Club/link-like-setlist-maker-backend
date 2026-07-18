import type { CatalogCandidate } from "./normalize.js";
import type { CatalogDiff, SongSeedEntry } from "./diff.js";
import type { MatchResult } from "./deezerMatcher.js";

export type NewSongEntry = {
  candidate: CatalogCandidate;
  id: string;
  unitId: string;
  match: MatchResult;
};

/** songs.json のキー順を既存エントリと揃え、git diff を最小化する */
function toSeedEntry(song: SongSeedEntry): SongSeedEntry {
  return {
    id: song.id,
    title: song.title,
    titleJa: song.titleJa ?? song.title,
    unitId: song.unitId,
    sortOrder: song.sortOrder,
    ...(song.releaseDate !== undefined ? { releaseDate: song.releaseDate } : {}),
    deezerTrackId: song.deezerTrackId ?? null
  };
}

export function appendNewSongs(songs: SongSeedEntry[], newSongs: NewSongEntry[]): SongSeedEntry[] {
  const maxSortOrder = songs.reduce((max, song) => Math.max(max, song.sortOrder), 0);

  const appended = [...newSongs]
    .sort((a, b) => {
      const dateA = a.candidate.releaseDate ?? "9999-12-31";
      const dateB = b.candidate.releaseDate ?? "9999-12-31";
      return dateA.localeCompare(dateB) || a.candidate.title.localeCompare(b.candidate.title, "ja");
    })
    .map((entry, index) => {
      const autoTrackId =
        entry.match.decision === "auto" ? entry.match.candidates[0]?.trackId ?? null : null;

      return toSeedEntry({
        id: entry.id,
        title: entry.candidate.title,
        titleJa: entry.candidate.title,
        unitId: entry.unitId,
        sortOrder: maxSortOrder + index + 1,
        ...(entry.candidate.releaseDate ? { releaseDate: entry.candidate.releaseDate } : {}),
        deezerTrackId: autoTrackId
      });
    });

  return [...songs, ...appended];
}

export function serializeSongs(songs: SongSeedEntry[]): string {
  return `${JSON.stringify(songs, null, 2)}\n`;
}

function formatCandidateRow(entry: NewSongEntry): string {
  const lines = entry.match.candidates
    .map((candidate) => {
      const link = candidate.link ? ` — ${candidate.link}` : "";
      return `    - score ${candidate.score.toFixed(3)}: \`${candidate.trackId}\` ${candidate.title} / ${candidate.artistName} (${candidate.albumTitle ?? "album不明"})${link}`;
    })
    .join("\n");

  return lines || "    - 候補なし";
}

export function buildReviewReport(input: {
  seriesId: string;
  diff: CatalogDiff;
  added: NewSongEntry[];
  unresolvedUnits: CatalogCandidate[];
  requestCount: number;
}): string {
  const { seriesId, diff, added, unresolvedUnits } = input;
  const autoAdded = added.filter((entry) => entry.match.decision === "auto");
  const needsReview = added.filter((entry) => entry.match.decision !== "auto");

  const sections: string[] = [
    `## catalog-sync レポート (${seriesId})`,
    "",
    `- 公式サイトとの照合: 既存 ${diff.matchedCount} 曲一致 / 新曲 ${diff.newCandidates.length} 曲 / サイト側で見つからない既存曲 ${diff.missingFromSite.length} 曲`,
    `- HTTP リクエスト数: ${input.requestCount}`,
    ""
  ];

  if (autoAdded.length > 0) {
    sections.push("### 自動採用 (高確信度 Deezer マッチ)", "");
    for (const entry of autoAdded) {
      const top = entry.match.candidates[0];
      sections.push(
        `- **${entry.candidate.title}** → \`${entry.id}\` (unit: ${entry.unitId}, deezer: ${top?.trackId})`,
        formatCandidateRow(entry)
      );
    }
    sections.push("");
  }

  if (needsReview.length > 0) {
    sections.push(
      "### 要レビュー (deezerTrackId は null で追加。確定したら songs.json に記入してください)",
      ""
    );
    for (const entry of needsReview) {
      sections.push(
        `- **${entry.candidate.title}** → \`${entry.id}\` (unit: ${entry.unitId}, 判定: ${entry.match.decision})`,
        formatCandidateRow(entry)
      );
    }
    sections.push("");
  }

  if (unresolvedUnits.length > 0) {
    sections.push(
      "### ユニット未解決 (songs.json には追加していません)",
      "",
      "unit-aliases.json か units.json にエントリを足して再実行してください。",
      ""
    );
    for (const candidate of unresolvedUnits) {
      const source = candidate.sources[0];
      sections.push(
        `- **${candidate.title}** — 歌: ${candidate.performerCredit ?? "(不明)"} — [${source?.releaseTitle ?? "?"}](${source?.url ?? ""})`
      );
    }
    sections.push("");
  }

  if (diff.missingFromSite.length > 0) {
    sections.push(
      "### 公式サイトで見つからなかった既存曲 (参考情報。自動では何もしません)",
      ""
    );
    for (const song of diff.missingFromSite) {
      sections.push(`- ${song.titleJa ?? song.title} (\`${song.id}\`)`);
    }
    sections.push("");
  }

  return sections.join("\n");
}
