#!/usr/bin/env bash
# catalog-sync の Cloud Run Job + Cloud Scheduler をデプロイする。
# 前提:
#   - gcloud がプロジェクト link-like-setlist-maker で認証済み
#   - Secret Manager に以下が存在すること:
#       catalog-sync-github-token : repo への contents/pull-requests write 権限を持つ
#                                   fine-grained PAT (PR 作成用)
#     作成例: printf '%s' "$TOKEN" | gcloud secrets create catalog-sync-github-token --data-file=-
set -euo pipefail

PROJECT="link-like-setlist-maker"
REGION="asia-northeast1"
JOB="catalog-sync"
REPOSITORY="${GITHUB_REPOSITORY:-Suki-Suki-Club/link-like-setlist-maker-backend}"
SCHEDULE="0 6 * * *" # 毎日 06:00 JST
TIME_ZONE="Asia/Tokyo"

cd "$(dirname "$0")/../.."

# ソースからビルドしてジョブを作成/更新 (バックエンド service と同じ Docker イメージ定義を使う)
gcloud run jobs deploy "$JOB" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source=. \
  --command=node \
  --args=dist/scripts/catalog-sync/cli.js,--series=all \
  --set-env-vars="GITHUB_REPOSITORY=$REPOSITORY" \
  --set-secrets="GITHUB_TOKEN=catalog-sync-github-token:latest" \
  --max-retries=0 \
  --task-timeout=1800 \
  --memory=1Gi

# サービスアカウント (Compute default) に Cloud Run 起動権限を持つ Scheduler ジョブを作成
SERVICE_ACCOUNT="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"

if gcloud scheduler jobs describe "$JOB-daily" --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  ACTION="update"
else
  ACTION="create"
fi

gcloud scheduler jobs "$ACTION" http "$JOB-daily" \
  --project="$PROJECT" \
  --location="$REGION" \
  --schedule="$SCHEDULE" \
  --time-zone="$TIME_ZONE" \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$JOB:run" \
  --http-method=POST \
  --oauth-service-account-email="$SERVICE_ACCOUNT"

echo "done. 手動実行: gcloud run jobs execute $JOB --region=$REGION"
