/**
 * catalog-sync: ラブライブ公式サイトの楽曲情報を取得し、prisma/seed-data/songs.json との
 * 差分から新曲を検出して Deezer マッチングし、PR を生成する。
 *
 * 使い方:
 *   tsx scripts/catalog-sync/cli.ts --series=hasunosora --dry-run
 *   tsx scripts/catalog-sync/cli.ts --series=all            # PR まで作成 (要 GITHUB_TOKEN)
 *
 * オプション:
 *   --series=<id|all>  対象シリーズ (既定: sync-config.json の enabledSeries 全部)
 *   --dry-run          ファイル更新も PR 作成もせず、レポートを標準出力に出す
 *   --no-pr            songs.json をローカルで書き換えるだけで PR は作らない
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createFetcher } from "./fetcher.js";
import { hasunosoraScraper } from "./scrapers/hasunosora.js";
import { nijigasakiScraper } from "./scrapers/nijigasaki.js";
import { yuigaokaScraper } from "./scrapers/yuigaoka.js";
import type { SeriesScraper } from "./scrapers/types.js";
import { buildCatalogCandidates, createTrackExcluder, type CatalogCandidate } from "./normalize.js";
import { diffCatalog, type SongSeedEntry } from "./diff.js";
import { createUnitResolver, type UnitSeedEntry } from "./unitResolver.js";
import { generateSongId } from "./idGenerator.js";
import { matchSongToDeezer, type MatcherThresholds } from "./deezerMatcher.js";
import { appendNewSongs, buildReviewReport, serializeSongs, type NewSongEntry } from "./emit.js";
import { pushChangesAndOpenPr } from "./github.js";

const SCRAPERS: Record<string, SeriesScraper> = {
  [hasunosoraScraper.seriesId]: hasunosoraScraper,
  [nijigasakiScraper.seriesId]: nijigasakiScraper,
  [yuigaokaScraper.seriesId]: yuigaokaScraper
};

type SyncConfig = {
  enabledSeries: string[];
  excludeTrackPatterns: string[];
  /** リリースタイトルがこのパターンに一致する場合、収録曲を丸ごと対象外にする(サントラ等) */
  excludeReleasePatterns: string[];
  deezer: MatcherThresholds & { searchIntervalMs: number };
  seriesArtistAliases: Record<string, string[]>;
  /** unitId → Deezer 上のアーティスト名義(英語表記など) */
  unitArtistAliases?: Record<string, string[]>;
};

const SEED_DATA_DIR = join(process.cwd(), "prisma", "seed-data");

async function readSeedJson<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(join(SEED_DATA_DIR, fileName), "utf8")) as T;
}

function parseArgs(argv: string[]) {
  const args = {
    series: null as string | null,
    dryRun: false,
    noPr: false
  };

  for (const arg of argv) {
    if (arg.startsWith("--series=")) {
      args.series = arg.slice("--series=".length);
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--no-pr") {
      args.noPr = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export async function runCatalogSync(argv: string[]) {
  const args = parseArgs(argv);

  const [config, units, songs, overrides] = await Promise.all([
    readSeedJson<SyncConfig>("sync-config.json"),
    readSeedJson<UnitSeedEntry[]>("units.json"),
    readSeedJson<SongSeedEntry[]>("songs.json"),
    readSeedJson<Record<string, number | null>>("deezer-track-overrides.json")
  ]);
  const aliases = await readSeedJson<Record<string, string>>("unit-aliases.json");

  const seriesIds =
    args.series && args.series !== "all" ? [args.series] : config.enabledSeries;

  for (const seriesId of seriesIds) {
    if (!SCRAPERS[seriesId]) {
      throw new Error(
        `No scraper implemented for series "${seriesId}" (available: ${Object.keys(SCRAPERS).join(", ")})`
      );
    }
  }

  const fetcher = createFetcher();
  const isExcluded = createTrackExcluder(config.excludeTrackPatterns);
  const unitResolver = createUnitResolver(units, aliases);
  const unitNameById = new Map(units.map((unit) => [unit.id, unit.name]));
  // override に載っている曲は人間が確定済みなので、diff・マッチングの対象から外れても
  // songs.json 側キーで照合される(新曲は override に存在し得ない)

  const existingIds = new Set(songs.map((song) => song.id));
  const reports: string[] = [];
  let updatedSongs = songs;
  let hasChanges = false;
  let needsReview = false;

  for (const seriesId of seriesIds) {
    const scraper = SCRAPERS[seriesId];
    console.error(`[catalog-sync] scraping ${seriesId}...`);
    const allReleases = await scraper.scrape(fetcher);
    const releaseExcludes = (config.excludeReleasePatterns ?? []).map(
      (pattern) => new RegExp(pattern, "i")
    );
    const releases = allReleases.filter(
      (release) => !releaseExcludes.some((pattern) => pattern.test(release.title.normalize("NFKC")))
    );
    const candidates = buildCatalogCandidates(releases, isExcluded);
    console.error(
      `[catalog-sync] ${seriesId}: ${allReleases.length} releases (${allReleases.length - releases.length} excluded) → ${candidates.length} candidate songs`
    );

    const seriesSongs = updatedSongs.filter((song) => {
      const unit = units.find((entry) => entry.id === song.unitId);
      return unit?.seriesId === seriesId;
    });
    const diff = diffCatalog(candidates, seriesSongs);

    const resolved: Array<{ candidate: CatalogCandidate; unitId: string }> = [];
    const unresolvedUnits: CatalogCandidate[] = [];

    for (const candidate of diff.newCandidates) {
      const unitId = unitResolver.resolve(candidate.performerCredit);

      if (unitId) {
        resolved.push({ candidate, unitId });
      } else {
        unresolvedUnits.push(candidate);
      }
    }

    const added: NewSongEntry[] = [];

    for (const { candidate, unitId } of resolved) {
      const id = await generateSongId(candidate.title, seriesId, existingIds);
      existingIds.add(id);

      const unitName = unitNameById.get(unitId);
      console.error(`[catalog-sync] deezer matching: ${candidate.title} (${unitName ?? unitId})`);
      const match = await matchSongToDeezer(
        {
          title: candidate.title,
          unitNames: [
            ...(unitName ? [unitName] : []),
            ...(config.unitArtistAliases?.[unitId] ?? [])
          ],
          seriesArtists: config.seriesArtistAliases[seriesId] ?? []
        },
        {
          thresholds: config.deezer,
          intervalMs: config.deezer.searchIntervalMs
        }
      );

      added.push({ candidate, id, unitId, match });

      if (match.decision !== "auto") {
        needsReview = true;
      }
    }

    if (unresolvedUnits.length > 0) {
      needsReview = true;
    }

    if (added.length > 0) {
      updatedSongs = appendNewSongs(updatedSongs, added);
      hasChanges = true;
    }

    reports.push(
      buildReviewReport({
        seriesId,
        diff,
        added,
        unresolvedUnits,
        requestCount: fetcher.requestCount()
      })
    );
  }

  const report = reports.join("\n\n");
  console.log(report);

  if (!hasChanges) {
    console.error("[catalog-sync] no new songs — nothing to do");
    return { hasChanges, needsReview, report };
  }

  if (args.dryRun) {
    console.error("[catalog-sync] dry-run: songs.json は更新しません");
    return { hasChanges, needsReview, report };
  }

  const serialized = serializeSongs(updatedSongs);
  await writeFile(join(SEED_DATA_DIR, "songs.json"), serialized);
  console.error("[catalog-sync] songs.json を更新しました");

  if (args.noPr) {
    return { hasChanges, needsReview, report };
  }

  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required to open a PR (or pass --no-pr)");
  }

  const today = new Date().toISOString().slice(0, 10);
  const { prNumber, prUrl } = await pushChangesAndOpenPr(
    {
      token,
      repository,
      branch: "catalog-sync/daily",
      baseBranch: "main"
    },
    {
      files: [{ path: "prisma/seed-data/songs.json", content: serialized }],
      commitMessage: `catalog-sync: update songs.json (${today})`,
      prTitle: `catalog-sync: 新曲の取り込み (${today})`,
      prBody: report,
      labels: [needsReview ? "catalog-sync:needs-review" : "catalog-sync:auto"]
    }
  );

  console.error(`[catalog-sync] PR #${prNumber}: ${prUrl}`);
  return { hasChanges, needsReview, report, prUrl };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCatalogSync(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
