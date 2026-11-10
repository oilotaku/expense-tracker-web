#!/usr/bin/env bash
# 正式部署：拉 GitHub Actions 建好的映像（docker-publish.yml），不在本機 build。
# 用法：scripts/deploy-pull.sh [tag]   tag 預設 latest，可指定 sha-xxxxxxx 回滾
set -euo pipefail
cd "$(dirname "$0")/.."
tag="${1:-latest}"
if [ "$tag" != latest ]; then
  for svc in backend frontend; do
    docker pull "ghcr.io/oilotaku/expense-tracker-web-$svc:$tag"
    docker tag "ghcr.io/oilotaku/expense-tracker-web-$svc:$tag" "ghcr.io/oilotaku/expense-tracker-web-$svc:latest"
  done
else
  docker compose pull backend frontend
fi
docker compose up -d --no-build --wait backend frontend
docker compose exec -T backend alembic upgrade head
