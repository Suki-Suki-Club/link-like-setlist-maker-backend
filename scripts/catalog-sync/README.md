# catalog-sync

ラブライブ公式サイト (lovelive-anime.jp) の楽曲情報を継続取得し、`prisma/seed-data/songs.json` との差分から新曲を検出して Deezer とマッチングし、PR を自動生成するパイプライン。

## データフロー

```
公式サイト (シリーズ別ページ)
  → scrapers/*        リリース+トラック抽出 (シリーズごとに HTML 構造が違う)
  → normalize         NFKC 正規化 / Off Vocal・ドラマ等の除外 / 複数CD収録の重複統合(最古日付)
  → diff              songs.json と照合 (キー: 正規化タイトル)。既存曲は絶対に書き換えない
  → unitResolver      歌クレジット → unitId (units.json + unit-aliases.json。自動作成はしない)
  → idGenerator       新曲の恒久 ID (ローマ字 slug、衝突時 hash)。発行後は変更不可
  → deezerMatcher     Deezer /search + 確信度スコア
  → emit / github     songs.json 更新 + レビューレポート + PR
main マージ後 → GitHub Actions (apply-catalog.yml) が db:seed + backfill:song-media で DB 反映
```

## 実行方法

```bash
# レポートだけ見る(何も書き換えない)
npx tsx scripts/catalog-sync/cli.ts --series=hasunosora --dry-run

# songs.json をローカルで更新(PR は作らない)
npx tsx scripts/catalog-sync/cli.ts --series=hasunosora --no-pr

# PR まで作成 (要 GITHUB_TOKEN / GITHUB_REPOSITORY 例: "owner/repo")
npx tsx scripts/catalog-sync/cli.ts --series=all
```

## Deezer マッチングの判定

| 判定 | 条件 | 動作 |
|---|---|---|
| auto | score ≥ 0.9 かつ 次点との差 ≥ 0.15 | `deezerTrackId` を記入。PR に `catalog-sync:auto` ラベル → CI 通過で自動マージ |
| review | 0.6 ≤ score < 0.9 または差が僅少 | `null` で追加。PR 本文に候補 top3 を列挙、人間が記入 |
| none | score < 0.6 | `null` で追加(アプリは unavailable 表示で正常動作) |

- しきい値は `prisma/seed-data/sync-config.json` で調整可能。
- `prisma/seed-data/deezer-track-overrides.json` は人間の確定値として **songs.json より優先** して seed に適用される(`null` = Deezer に存在しないと確認済み)。

## ユニット解決

- `歌：` クレジットから `(CV.…)` と `［メンバー一覧］` を除去し、`units.json` の正名と `unit-aliases.json` で照合。
- 解決できない場合、その曲は **songs.json に追加されず** PR レポートの「ユニット未解決」に載る。エイリアスかユニットを追加して再実行する。ユニットの自動作成は意図的にしていない(UI のグルーピングに直結するため)。

## 運用上の注意

- **公式サイトは非ブラウザ UA に 403 を返す**(検証済み)。fetcher はブラウザ相当 UA + 直列 2 秒間隔でアクセスする。並列化しないこと。
- 海外 IP からのアクセス可否は未確認のため、定期実行は **Cloud Run Job (asia-northeast1)** で行う(Phase 0 で GCP 東京リージョンからの 200 を確認済み)。
- 一覧ページのエントリが 0 件になった場合はサイト改修の可能性が高いのでエラーで停止する。
- シリーズを増やすときは `scrapers/` にアダプタを追加し、`sync-config.json` の `enabledSeries` に足す。fixture HTML を `__fixtures__/` に保存してパーステストを書くこと。
