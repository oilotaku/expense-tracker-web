---
name: start-dev
description: 啟動 harness 專案的開發環境（一律 Docker Compose）：`docker compose up -d --build` 起 frontend / backend / db (+ redis) → 等全部 healthy → 容器內 `alembic upgrade head` → 背景 `docker compose watch` 同步程式碼變更。冪等，重複跑只重建有變更的 image。當使用者說「啟動專案 / 跑起來 / 開發環境啟動 / start dev / 起 dev server」時觸發。不適用：要初始化專案（用 /harness-init）、要跑測試或 lint（見 AGENTS.md § Build / Test / Lint）。
---

# start-dev

整個開發環境都在 Docker Compose 內跑：沒有本機 uvicorn、沒有本機 `next dev`、沒有 port 殺手。

## 心法

1. **只啟停容器，不改任何檔**（`.env` / compose / Dockerfile 都只讀）
2. **冪等**：`up -d --build` 只重建有變更的 image，已在跑的容器不動
3. **單一 compose**：dev / prod 同一份 `docker-compose.yml`（`→ CICD-044`），程式碼熱更新靠 `develop.watch`，不用 override 檔、不用 bind mount

## 執行步驟

### 1. cwd 健全性檢查

`docker-compose.yml` 與 `.env` 必須都存在；任一缺 → 中止：
- 缺 `docker-compose.yml`：「請 `cd` 到專案根目錄再跑 `/start-dev`」
- 缺 `.env`：「請 `cp .env.development.example .env` 並填入 `<generate-32-bytes-hex>` 佔位」

`docker info` exit ≠ 0 → 中止：「Docker daemon 未啟動」。

### 2. 讀 port（只讀）

從 `.env` 取 `BACKEND_PORT` / `FRONTEND_PORT`（回報用）。

### 3. 起容器

```bash
docker compose up -d --build
```

exit ≠ 0 → 貼輸出中止。接著等 healthy：`docker compose ps --format json` 中每個 service 的 `Health` 皆為 `healthy`，最多等 120 秒（首次 build 較久）；逾時 → `docker compose logs --tail 50 <未 healthy 的 service>` 貼給使用者並中止。

### 4. Migration（容器內）

```bash
docker compose exec backend alembic upgrade head
```

exit ≠ 0 → 貼輸出中止（`→ DB-054`：這是唯一的 schema 套用方式）。

### 5. 程式碼同步（背景）

用 Bash tool `run_in_background: true`：

```bash
docker compose watch --no-up
```

- `backend/` 變更 → sync 進容器並重啟 `backend`；`pyproject.toml` / `uv.lock` 變更 → rebuild
- `frontend/` 變更 → rebuild `frontend`（standalone build，無法 sync）

### 6. Smoke check

`docker compose ps` 全 healthy 即代表 `/api/<v>/health` 已回 200（`backend` healthcheck 就是打它）。額外印一次內容給使用者看：

```bash
docker compose exec backend python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:<backend_port>/api/v1/health').read().decode())"
```

期望含 `"db": "ok"`（有 redis 時另含 `"redis": "ok"`）。

### 7. 回報

- Swagger：`http://localhost:<backend_port>/api/docs`
- Health：`http://localhost:<backend_port>/api/v1/health`
- Frontend：`http://localhost:<frontend_port>`
- Log：`docker compose logs -f backend` / `docker compose logs -f frontend`
- 停止：`/stop-dev`

## 自我約束

- **禁**改任何檔（含 `.env`）
- **禁** `docker compose down`（任何旗標）；**禁** `-v` / `--volumes`
- **禁**在宿主機直接跑 uvicorn / `npm run dev` / `uv` / `npm`
- 缺 `docker` 或 daemon 未啟動 → 告知並中止，不假裝能跑

## 不做的事

- 不跑 lint / typecheck / test（見 `AGENTS.md § Build / Test / Lint`）
- 不檢查 git 狀態
