# AGENTS.md — Harness-Engineering

跨工具（Claude Code / Codex / Cursor / Cline / Aider）agent 協議。**鎖定 Next.js + FastAPI + PostgreSQL（+ Redis）+ Docker Compose。** 本檔為公版模板：不含任何專案、人員、機器或環境專屬值；需要專案值的地方一律由 `/harness-init` 填入或引用規則 ID。

## Harness

- 規範正文（`rules/` `skills/` `hooks/`）**不複製**進專案（skill 例外：`/harness-init` 複製到 `.claude/skills/`），agent 直接讀 harness clone；本檔內所有 `rules/…` `skills/…` `hooks/…` 相對路徑以 `HARNESS_HOME` 為根
- `HARNESS_HOME` 是**符號**，不寫死絕對路徑（版控檔不得綁定任何一台機器）。解析順序，第一個命中即用：
  1. `<cwd>/.claude/harness.local.json` 的 `harness_home`（`/harness-init` 寫入，**gitignored**）
  2. 環境變數 `HARNESS_HOME`
  3. `<cwd>/harness/` → `<cwd>/../Harness-Engineering/` → `<cwd>/../harness/`
- 命中判準：目錄同時含 `AGENTS.md`、`scaffold/scaffold.mjs`、`hooks/settings.template.json`、`rules/00-core/00-overview.md`
- 升級：在 `HARNESS_HOME` 內 `git pull`；`CLAUDE.md` / `AGENTS.md` / hooks / skills 有變動時重跑 `/harness-init --refresh`（同步 `.claude/skills/` 與 `.githooks/`）
- Claude Code skills 一律裝**專案級** `<cwd>/.claude/skills/`（進版控），**不**裝 `~/.claude/skills/`：skill 與專案綁定的 harness 版本一致，才能被 `--refresh` 同步
- 在 harness 倉庫本身，`HARNESS_HOME` 即 `.`

## Project Overview

個人記帳網站，追蹤日常收支與分類統計。

## Tech Stack

- **Frontend**：Next.js（App Router）+ TypeScript `strict` + Redux Toolkit + RTK Query + Tailwind v4
- **Backend**：Python + FastAPI + SQLAlchemy 2 async + Pydantic 2 + Alembic + uv + httpx
- **Database**：PostgreSQL（asyncpg）
- **Cache**：Redis（可選；有快取需求一律用它，不用其他方案）
- **Runtime**：Docker Compose，**dev 與 prod 都在容器內跑**（同一份 compose，差在 env）；宿主機只需 Docker + Node（跑 scaffold / hooks），**不裝** uv / Python / 專案 node_modules
- 版本鎖到 patch，**唯一真相 `rules/00-core/01-versions.md`**；不在此棧的技術不套本 harness

## Agent Capabilities Baseline

地板 = 能讀檔 / 能寫檔 / 能執行 shell。工具更強（plan mode / sub-agent / hook / skill）只可**加強**遵守，不可降低。

**遵守的對象是產出契約與 Acceptance，不是執行過程**：agent 可自主規劃順序，`skills/*/SKILL.md` 的編號步驟是參考實作。產出格式、Acceptance、scope 守門、毀滅性操作禁止不因此放寬。可並行即並行。

## Just-in-time Loading

永遠載入：本檔 + `rules/00-core/00-overview.md`。其餘依任務載入，**不預載**歷史報告（舊版 `fixed.md` / `reflect/` / `scan/`）：

| 任務 | 追加載入 |
| --- | --- |
| 加套件 / 升版 | `rules/00-core/01-versions.md` |
| env / secret / 部署設定 | `rules/00-core/02-secrets-and-env.md` |
| 任何時間 / 日期欄位 | `rules/00-core/03-timezone.md` |
| 新增 / 改 API endpoint、OpenAPI docs | `rules/00-core/04-api-docs.md` |
| 寫 propose / 拆 task / 寫 fixed | `rules/00-core/10-propose-tasks-fixed.md` |
| 升版號 / CHANGELOG / reflect 升規 | `rules/00-core/11-rule-evolution.md` |
| 跑 scaffold / 初始化 / 改模板 / 發布 harness | `rules/00-core/12-template-integrity.md` |
| 前端任何任務 | `rules/10-frontend/*.md` |
| 後端任何任務 | `rules/20-backend/*.md` |
| schema / migration / query | `rules/30-database/*.md` |
| 快取 / session / rate limit | `rules/40-cache/*.md` |
| CI / compose / Dockerfile / 部署 / 備份還原 | `rules/50-ci-cd/*.md` |
| 發 PR 前 | `rules/00-core/20-git-and-review.md` + `21-checklists.md` |

規則 ID：`<AREA>-<NNN>`（`CORE-012` / `FE-005` / `BE-021` / `DB-007` / `CACHE-003` / `CICD-004`）。一條規則只在一個檔定義，其他處寫 `→ ID` 引用。

## Project Rules

專案自己的規則放 `<cwd>/docs/Rules/*.md`（格式同 `rules/`，`area: PROJ`，ID `PROJ-NNN`），只能比 harness 規則更嚴；本節由專案維護，`/harness-init --refresh` **保留不覆寫**。任務命中下列列時追加載入：

| 任務 | 追加載入 |
| --- | --- |
| （由專案填寫，例：訂單模組 → `docs/Rules/01-orders.md`） | |

## Build / Test / Lint

一律在容器內執行（backend 需先 `/start-dev` 讓 `backend` / `db` 在跑）：

```bash
# 整合測試（要真實 DB）走 compose 內的 backend container
docker compose exec backend sh -c "uv sync --frozen && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest"

# 只驗工作區（不需 DB、也不需先 start-dev）：venv / cache 一律留在容器內（→ CORE-146）
docker run --rm -v "$PWD/backend:/app" -w /app \
  -e UV_PROJECT_ENVIRONMENT=/tmp/venv -e UV_CACHE_DIR=/tmp/uv-cache \
  ghcr.io/astral-sh/uv:<UV_VERSION>-python<PYTHON_VERSION>-trixie-slim \
  sh -c "uv sync --frozen && uv run ruff check . && uv run ruff format --check . && uv run mypy app"

docker run --rm -v "$PWD/frontend:/app" -w /app -e npm_config_cache=/tmp/npm-cache \
  node:<NODE_VERSION>-alpine sh -c "npm ci && npm run lint && npm run typecheck && npm run test -- --run && npm run build"

git diff --exit-code && git status --porcelain   # build 不得產生任何版控差異（→ CORE-144）
```

`<NODE_VERSION>` / `<PYTHON_VERSION>` 取 `.env`，`<UV_VERSION>` 取版本表。PR self-check = 上列指令逐項對齊，不另列一套。

**驗證的對象是工作區**（`→ CORE-146`）：在 container 內 `--fix` 的結果若沒回寫到工作區就不算修好；回寫後**必**重建 image（`docker compose up -d --build`）再跑一次。**禁**在宿主機工作區產生 `.venv/`（Windows 上的 Linux symlink 會讓 Docker build context 掃描直接失敗）。其餘日常指令（migration / 單檔測試 / codegen / psql / audit）→ `COMMANDS.md`。

## Local Dev

`/start-dev`（`docker compose up -d --build` → 容器內 `alembic upgrade head` → 背景 `docker compose watch`）/ `/stop-dev`（`docker compose stop`）。**禁**宿主機直接跑 uvicorn / `next dev`。部署 env 見 `rules/00-core/02-secrets-and-env.md`。

## Code Style

- **Output**：回應 / 註解 / 文件 / commit 的語言 `→ CORE-004`；程式碼 / 指令 / 識別字 / 檔名一律英文
- **Comments**：不主動加；只在 *why* 非自明時加
- **TS**：`strict`、禁 `any`、props 獨立 `interface`、函式必標型別
- **Python**：PEP 484/585、禁 `Any` / `typing.List` / `typing.Dict`、`AsyncSession` from `sqlalchemy.ext.asyncio`
- **時區**：內部層（DB / app / log / container）UTC，API 邊界轉 `Settings.API_TZ` `→ CORE-041`；DB `TIMESTAMPTZ`、app 層 aware UTC、log ISO 8601 帶 offset（`rules/00-core/03-timezone.md` 唯一寫處，本檔不寫時區值）
- **Naming**：各 area `00-overview.md`

## Testing

- 後端整合測試**禁** mock SQL / Redis，用 compose 起的真實測試實例
- 第三方 HTTP：`respx` / `httpx.MockTransport`；前端 `vitest` + `msw`；e2e Playwright

## Git Workflow

- Commit：`(AI?) <Add|Modify|Fix|Refactor|Docs>: <描述>`；AI 產生**必** `(AI)` 前綴（commit hook 機械驗證）
- bug / 規範違反 → 同步當版 `docs/Tasks/v*/fixed.md`，每條帶 `rule: <ID>`
- `tasks-v*.md` checkbox 與頂部狀態一致
- PR gate `→ CORE-093`（CI 必綠 + `/harness-scan` 獨立評分）；審查模型 `→ CORE-016`
- **禁** `--force` / `reset --hard` / `--no-verify`；push 只經 `/commit-all` `/merge-main`（直接 push，不確認）
- 跨工具機械層：`.githooks/`（`commit-msg` 驗格式、`pre-commit` 擋機密檔）由 `/harness-init` 安裝並設 `core.hooksPath`；任何工具 commit 都經過

## 毀滅性操作禁止（文字層；機械層見 `hooks/`）

- 禁 `DROP DATABASE|SCHEMA|TABLE|COLUMN`（含 migration）
- 禁 `docker compose down -v` / `--volumes`、禁 `FLUSHALL` / `FLUSHDB`
- 禁 `rm -rf` 及等價遞迴強刪，**無例外**
- 可能造成資料遺失 / 不可逆 / 環境重建 → 停下改安全方案，或請人手動確認並備份

## Security

- 機密**僅**經 env var；`.env` gitignore；`git log --all -- .env` 為空；每層 `.env.<env>` 對應 `.env.<env>.example`
- production 啟動 fail-fast（secret ≥ 32 字元、非預設值）；scaffold 現場生成隨機金鑰
- 機密不入 log；`docs/` 不豁免 secret-scan
- 偵測規則：`rules/00-core/21-checklists.md` CORE-120..137（`/harness-scan` 的 R-xxx 掃描規則對應到這些 ID）

## Boundaries

- 業務模組（auth / RBAC / dashboard）→ 各專案 `docs/Tasks/v*/` 規劃，不預先 scaffold；scaffold `--with-example` 的 `users` 切片是各層寫法的**參考實作**（無登入 / 權限），不是業務模組，可整條移除
- 非 Docker Compose 的部署平台、非本棧技術 → 不涵蓋

## Rule Precedence

```
rules/* > docs/Rules/*（專案規則，只能加嚴）> docs/Arch/*（ADR）> AGENTS.md / CLAUDE.md > docs/Tasks/*
```

`CLAUDE.md` 只補 Claude Code 特性，不重述。優先序唯一寫處 `rules/00-core/00-overview.md`。
