---
name: harness-init
description: 把 Harness-Engineering 套到當前專案：定位 harness clone 位置 → 檢查 node / docker → AskUserQuestion 收 project_name / use_redis / backend_port / frontend_port / with_example → 跑 scaffold.mjs 產 Next.js (App Router) + FastAPI + PostgreSQL (+ Redis) + Docker Compose 骨架 → 寫 CLAUDE.md / AGENTS.md → 裝 .claude/hooks + settings.json → 建 docs/Arch docs/Tasks → 安裝其餘 skills 到專案 .claude/skills/ → 裝跨工具 .githooks/ → acceptance。`--refresh` 只重寫 CLAUDE.md / AGENTS.md / hooks / settings / .githooks 並同步 .claude/skills/。當使用者說「初始化專案 / 套 harness / harness init / new project / scaffold / 開新專案 / 更新 harness 設定」時觸發。不適用：Vue / Express / Spring / MySQL / Mongo 等非本棧專案（本 harness 不涵蓋）、只想跑 dev server（用 /start-dev）、只想掃描（用 /harness-scan）。全程不刪任何目錄。
---

# harness-init

從「clone 好 harness」一路自動跑到「`frontend/` + `backend/` 可跑、規範接上、hooks 生效」的單入口 skill。**規範本體不複製進專案**：agent 之後直接從 harness 目錄讀 `rules/`；流程本體在 `skills/`（複製進 `.claude/skills/`）。

## 心法

1. **不自由發揮**：程式碼骨架全交給 `<harness>/scaffold/scaffold.mjs`；規範檔只從 harness 複製 + 填欄位，不自寫規則字句
2. **版本只在一處**：`<harness>/rules/00-core/01-versions.md`（scaffold manifest 由它同步），本 skill 不指定任何版本號
3. **不刪任何目錄、不覆寫既存檔**：既存 `frontend/` 或 `backend/` → 跳過 scaffold；非空專案一律用 `--merge`（→ CORE-142），**禁** `--force`、**禁**任何遞迴強刪指令（POSIX / PowerShell 皆同）
4. **機密不經對話**：`AskUserQuestion` 只收 5 個非機密參數；JWT / DB 密碼由 scaffold 現場 `crypto.randomBytes(32).toString('hex')` 寫進 `.env`
5. **AskUserQuestion 首項標 `(Recommended)`**，且高破壞性 / 不可逆選項**禁**標 Recommended；中性二選一可省
6. **輸出繁體中文**；指令 / 路徑 / 識別字英文
7. **可並行即並行**：§ 5–§ 7 之間互不依賴，可同時執行

## 模式

| 呼叫 | 行為 |
| --- | --- |
| `/harness-init` | 全流程 § 1 → § 9 |
| `/harness-init --refresh` | 只跑 § 1、§ 5（重寫 `CLAUDE.md` / `AGENTS.md`）、§ 6（hooks + settings + `.githooks/`）、§ 8（同步 skills 並回報漂移）；**不**碰 `frontend/` `backend/` `docs/` `.env` |

## 執行步驟

### 1. 定位 harness 目錄

skill 安裝在 `<cwd>/.claude/skills/harness-init/`（專案級，**不**裝全域），與 harness clone 位置無固定關係，因此依序偵測，**第一個命中即用**：

1. `<cwd>/.claude/harness.local.json` 的 `harness_home`（前次 init 寫入；gitignored）
2. 環境變數 `HARNESS_HOME`
3. `<cwd>/harness/`
4. `<cwd>/../Harness-Engineering/`
5. `<cwd>/../harness/`

命中判準：該目錄同時含 `AGENTS.md`、`scaffold/scaffold.mjs`、`hooks/settings.template.json`、`rules/00-core/00-overview.md`。全部落空 → `AskUserQuestion`（free text）請使用者貼 harness 絕對路徑，再驗一次；仍無效 → 中止並提示 `git clone <repo> harness`。

把定位到的**絕對路徑**記為 `<harness>`，後續所有步驟用它；回報給使用者。**絕對路徑只能存在於 `.claude/harness.local.json`（gitignored）**，禁寫入 `CLAUDE.md` / `AGENTS.md` / 任何版控檔——版控檔只用符號 `HARNESS_HOME`。

### 2. 工具檢查（node / docker）

宿主機只需這兩個：node 跑 scaffold.mjs 與 hooks，docker 跑一切（lockfile、dev、test、lint）。**不檢查、不安裝** uv / Python / npm 套件。

| 工具 | 存在 | 版本 | 實際可用 |
| --- | --- | --- | --- |
| node | `node --version` exit 0 | major ≥ 20（hooks 需要） | `node -e "console.log(1)"` 印 `1` |
| docker | `docker --version` exit 0 | compose ≥ 2.22（`watch` 需要） | `docker compose version` exit 0 且 `docker info` exit 0（daemon 在跑） |

列成表回報（✓ / ✗ / ⚠）。任一 ✗ / ⚠ → `AskUserQuestion`：

- **代為安裝 (Recommended)** — 依下表跑；裝完**必重驗**；仍失敗 → 貼 stderr 中止
- **我自己裝** — 列指令，中止
- **跳過（`--no-install`）** — 只落檔；lockfile 與 acceptance 使用者自跑

| 缺 | Windows | macOS | Linux |
| --- | --- | --- | --- |
| node | `winget install OpenJS.NodeJS.LTS` | `brew install node` | NodeSource 或發行版套件 |
| docker | `winget install Docker.DockerDesktop` | `brew install --cask docker` | 官方 apt / dnf repo |

禁：不問就裝、裝替代工具（nvm / uv / pyenv / pip / poetry）、動 system Python、改 shell profile。安裝後 PATH 未刷新（Windows 常見）→ 告知「重開 Claude Code 後重跑 `/harness-init`」並中止，**不**拼絕對路徑呼叫。

`--refresh` 模式只檢 node。

### 3. 收參（`AskUserQuestion`，一次問完）

| 參數 | 校驗 | 預設 |
| --- | --- | --- |
| `project_name` | `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`（kebab-case） | cwd 資料夾名轉 kebab |
| `use_redis` | `true` / `false` | **false (Recommended)**；true 時 compose 多 `redis` service、backend 多 `redis[hiredis]` |
| `backend_port` | 1024–65535 整數 | `8000` |
| `frontend_port` | 同上，且 ≠ `backend_port` | `3000` |
| `with_example` | `true` / `false` | **false (Recommended)**；true 時多產 `users` 端到端範例切片（model / migration / repository / service / router / tests / RTK Query / `/users` 頁）與 `msw` / `openapi-typescript` devDependencies，供各層寫法參考，之後可整條移除 |

**只問這五項**。`postgres_port` 固定用 scaffold 預設；DB user 由 scaffold 統一為 `project_name` 底線化；密碼 / JWT secret 現場隨機生成，**不問**。`--refresh` 模式跳過本節（`project_name` 從既有 `AGENTS.md § Project Overview` 或 `backend/pyproject.toml` 取）。

同時用一句 free-text 問「專案一句話描述」（給 `AGENTS.md § Project Overview`），可空。

### 4. Scaffold

1. 若 `<cwd>/frontend/` **或** `<cwd>/backend/` 已存在 → 回報「偵測到既有骨架，跳過 scaffold」，直接進 § 5。**禁**加 `--force`
2. **一律加 `--merge`**（`→ CORE-142`）。專案根幾乎不可能是空的（至少有 `.git/`、多半還有 `README.md`），`--merge` 就是為此設計：只寫不存在的檔，`.env` / `README.md` 標 preserve 永不被動到，內容衝突則列出並中止。空目錄加 `--merge` 也完全正確（沒有東西可衝突），所以不需要先判斷目錄是否為空。

   先跑合併預演：

   ```bash
   node "<harness>/scaffold/scaffold.mjs" --project-name <project_name> [--use-redis] [--with-example] \
     --backend-port <backend_port> --frontend-port <frontend_port> \
     --target "<cwd>" --merge --dry-run
   ```

   - exit ≠ 0 且訊息為「merge 中止：N 個檔已存在且內容不同」→ **不要**改用 `--force`。把衝突清單原樣回報給使用者，逐檔問要保留專案版本還是採用 scaffold 版本（`AskUserQuestion`，**保留專案版本 (Recommended)**），採用 scaffold 版本者由使用者先自行備份／改名後再重跑
   - 其他 exit ≠ 0 → 貼輸出中止
3. 預演無衝突 → 去掉 `--dry-run` 實跑（`--no-install` 視 § 2 選擇）。參數名以 `<harness>/scaffold/README.md` 為準：`--project-name` / `--use-redis` / `--with-example` / `--frontend-port` / `--backend-port` / `--postgres-port` / `--redis-port` / `--api-version` / `--target` / `--merge` / `--dry-run` / `--no-install` / `--force`；**無** `--name`、**無** `--frontend` 參數（只有 Next）
4. scaffold exit 0 時，`backend/uv.lock` 與 `frontend/package-lock.json` **必定**存在（`→ CORE-141`，post_action 失敗即 exit ≠ 0）。仍要在 § 9 acceptance 明確檢查一次；用了 `--no-install` 則**必**先手動補產 lockfile（指令見 `COMMANDS.md § 1`）再進 § 9

scaffold 會產 `frontend/` `backend/` `docker-compose.yml` `.env`（含隨機金鑰）`.env.*.example` `.gitignore` `.gitattributes` `.gitleaks.toml` `.github/workflows/` `scripts/audit-gate.mjs` `security/audit-exceptions.json`；本 skill 不重述、不改。

### 5. 寫 `CLAUDE.md` 與 `AGENTS.md`

**原則：兩檔都是版控檔，不得含任何機器專屬值（絕對路徑 / 使用者名 / 磁碟代號）。** 絕對路徑只寫進 `.claude/harness.local.json`。

**`.claude/harness.local.json`**：寫入

```json
{ "harness_home": "<harness 絕對路徑>" }
```

並確認 `<cwd>/.gitignore` 含 `.claude/harness.local.json`（scaffold 的 `.gitignore` 已含；既存專案沒有則追加一行）。

**AGENTS.md**：複製 `<harness>/AGENTS.md` 到 `<cwd>/AGENTS.md`，再做一處替換（用 Node 或 PowerShell 字串取代，不手打整檔）：

1. `## Project Overview` 下的 `<一句話描述專案；由 /harness-init 填入。>` → § 3 收到的描述（空則填 `<project_name>`）
2. `--refresh` 時：先從既有 `<cwd>/AGENTS.md` 擷取 `## Project Rules` 到下一個 `## ` 之間的內容，覆寫後把這段原樣放回（專案規則清單屬專案，harness 不動）

`## Harness` 一節已在公版內（符號 `HARNESS_HOME` + 解析順序），**不插入、不改寫、不填路徑**。

**CLAUDE.md**：寫入（原樣，不代入路徑）

```markdown
# CLAUDE.md

@AGENTS.md

Claude Code 特有能力見 `HARNESS_HOME/CLAUDE.md`（hooks 硬擋 / sub-agent / 週期任務 / 收參 / 獨立評分）；本檔不重述。`HARNESS_HOME` 解析順序見 `AGENTS.md § Harness`。

## Hooks（本專案已安裝）

`.claude/hooks/guard-bash.mjs` 與 `.claude/hooks/guard-write.mjs` 由 `/harness-init` 從 `HARNESS_HOME/hooks/` 複製，`.claude/settings.json` 來源 `HARNESS_HOME/hooks/settings.template.json`。擋什麼見 `HARNESS_HOME/CLAUDE.md § 1`。
```

既存 `CLAUDE.md` / `AGENTS.md`（非 `--refresh`）→ `AskUserQuestion`：**保留既有並另存 `*.harness.md` 供合併 (Recommended)** / 覆寫 / 中止。`--refresh` 直接覆寫（這是 refresh 的定義），但先 `git status` 確認兩檔無未提交變更，有則先提示。

### 6. Hooks 與 settings

1. 建 `<cwd>/.claude/hooks/`（`New-Item -ItemType Directory -Force` / `mkdir -p`）
2. 複製 `<harness>/hooks/*.mjs` → `<cwd>/.claude/hooks/`（覆寫舊版；hooks 是 harness 管的，不算使用者客製）
3. `<cwd>/.claude/settings.json`：
   - 不存在 → 直接複製 `<harness>/hooks/settings.template.json`
   - 已存在 → 用 Node 讀兩份 JSON，把 template 的 `permissions.deny` 陣列**聯集**、`hooks.PreToolUse` 依 `matcher` 去重合併後寫回；不動使用者其他 key
4. 驗：`node .claude/hooks/guard-bash.mjs` 以 stdin 餵 `{"tool_input":{"command":"git push --force origin main"}}` 應 exit 2；餵 `{"tool_input":{"command":"ls"}}` 應 exit 0
5. **跨工具 git hooks**（Codex / Cursor / Aider 也吃得到的機械層）：建 `<cwd>/.githooks/`，複製 `<harness>/hooks/git/*`（`pre-commit`、`commit-msg` 與對應 `.mjs`）進去，覆寫舊版；有 `.git/` 時執行 `git config core.hooksPath .githooks`，並對兩個無副檔名的 wrapper 執行 `git update-index --add --chmod=+x`（macOS / Linux 需執行位元）。驗：寫一個內容為 `bad msg` 的暫存檔，`node .githooks/commit-msg.mjs <該檔>` 應 exit 1

### 7. `docs/` 骨架（`--refresh` 跳過）

用 Node 或 PowerShell 建目錄與檔案（**不用 `touch`**）；**已存在的檔一律不覆寫**：

```
docs/
├── Arch/README.md                       ← templates/docs-Arch-README.md
├── Rules/
│   ├── README.md                        ← templates/docs-Rules-README.md
│   └── _template.md                     ← templates/docs-Rules-_template.md（複製改名即新規則檔；scan 不讀 `_` 開頭檔）
└── Tasks/
    ├── README.md                        ← templates/docs-Tasks-README.md
    ├── v1.0.0/
    │   ├── propose-v1.0.0.md            ← templates/propose-v1.0.0.md
    │   ├── tasks-v1.0.0.md              ← templates/tasks-v1.0.0.md
    │   └── fixed.md                     ← templates/fixed.md
    ├── reflect/.gitkeep
    └── scan-project/.gitkeep
```

模板在本 skill 目錄 `templates/`；複製時把 `{{project_name}}` / `{{date}}`（`YYYY-MM-DD`）替換掉。`{{harness_home}}` **一律代入符號字串 `HARNESS_HOME`，禁代入絕對路徑**——`docs/` 是版控檔，不得綁定任何一台機器（解析順序見 `AGENTS.md § Harness`）。

PowerShell 範例：

```powershell
$dirs = @('docs/Arch', 'docs/Rules', 'docs/Tasks/v1.0.0', 'docs/Tasks/reflect', 'docs/Tasks/scan-project')
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path (Join-Path $PWD $d) | Out-Null }
foreach ($k in @('docs/Tasks/reflect/.gitkeep', 'docs/Tasks/scan-project/.gitkeep')) {
  $p = Join-Path $PWD $k
  if (-not (Test-Path $p)) { New-Item -ItemType File -Path $p | Out-Null }
}
```

### 8. 安裝其餘 skills 到 `<cwd>/.claude/skills/`

來源 `<harness>/skills/<name>/`，目標 `<cwd>/.claude/skills/<name>/`（**專案級**；**禁**寫 `~/.claude/skills/`）。清單：`harness-init` `propose-to-tasks` `harness-scan` `harness-reflect` `start-dev` `stop-dev` `commit-all` `merge-main`（共 8 個，含入口自身，確保入口也跟 harness 同版）。

逐個比對整個目錄（`SKILL.md` 與 `templates/`）：相同 → 跳過；不同或缺 → 覆寫並列入「已同步」清單回報（`--refresh` 時這份清單就是漂移報告）。複製用 `Copy-Item -Recurse -Force` / `cp -r`，**不**先刪目標。`.claude/skills/` 進版控（不加 gitignore）。

偵測到 `~/.claude/skills/<name>/` 同名全域版 → 提示使用者手動移除，harness 不代刪。

### 9. Acceptance（`--refresh` 只跑 1、11、12）

任一失敗 → agent 修（只改 scaffold 產物或本 skill 寫的檔，**不**改 harness）≤ 3 次；仍失敗 → 列出失敗項與 stderr，不報完成。

1. `<cwd>/CLAUDE.md` 首行後含 `@AGENTS.md`；`<cwd>/AGENTS.md` 含 `## Harness` 與 `HARNESS_HOME`，且 `## Project Overview` 下已無 `<一句話描述專案` 佔位；`.claude/harness.local.json` 存在且 `harness_home` 指向通過 § 1 命中判準的目錄；**`CLAUDE.md` / `AGENTS.md` 內不含 `harness_home` 的絕對路徑字串**（含正斜線 / 反斜線兩種寫法）；`git check-ignore .claude/harness.local.json` exit 0（有 `.git/` 時）
2. `backend/uv.lock` 與 `frontend/package-lock.json` 存在且非空（`→ CORE-141`）；`<cwd>/.gitattributes` 存在且含 `eol=lf`（`→ CORE-143`）
3. `docker compose up -d --build` exit 0，`docker compose ps --format json` 全 service `healthy`（最多等 120 秒）
4. `docker compose exec backend alembic upgrade head` exit 0
5. `docker compose exec backend sh -c "uv sync --frozen && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest"` exit 0（整合測試打 compose 內真實 DB / Redis）
6. `docker run --rm -v "<cwd>/frontend:/app" -w /app -e npm_config_cache=/tmp/npm-cache node:<NODE_VERSION>-alpine sh -c "npm ci && npm run lint && npm run typecheck && npm run test -- --run && npm run build"` exit 0（`<NODE_VERSION>` 取 `.env`；路徑用正斜線）
7. **零漂移**（`→ CORE-144`）：跑完第 6 項後 `git diff --exit-code` 與 `git status --porcelain`（排除 `.env`）皆為空——工具不得改寫任何版控檔，也不得留下未忽略的產物
8. 安全 header 實測：`curl -sD- http://localhost:<backend_port>/api/<api_version>/health` 含 `content-security-policy: default-src 'none'`；`curl -sD- http://localhost:<frontend_port>/` 含 `Content-Security-Policy` 與 `frame-ancestors 'none'`（`→ CORE-128`）
9. 依賴稽核 gate 全綠（`→ CICD-028`）：依 `COMMANDS.md § 1.5` 產報告後 `node scripts/audit-gate.mjs npm …` 與 `… pip …` 皆 exit 0
10. `docker compose exec backend python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:<backend_port>/api/<api_version>/health').read().decode())"` 含 `"db": "ok"`（`use_redis` 時另含 `"redis": "ok"`）；`with_example` 時另跑 `docker compose exec backend alembic check` exit 0（model 與 migration 無漂移）；驗完 `docker compose stop`
11. `.claude/settings.json` 為合法 JSON、`permissions.deny` 含 template 的全部條目、`hooks.PreToolUse` 含 `guard-bash.mjs` 與 `guard-write.mjs`；§ 6-4 的 hook 自測通過；`.githooks/pre-commit` `.githooks/commit-msg` 存在且（有 `.git/` 時）`git config core.hooksPath` 回 `.githooks`
12. `ls .claude/skills/` 含 § 8 全部 8 個目錄，且每個與 `<harness>/skills/<name>/` 內容一致
13. `docs/Arch/README.md` `docs/Rules/README.md` `docs/Rules/_template.md` `docs/Tasks/README.md` `docs/Tasks/v1.0.0/{propose-v1.0.0.md,tasks-v1.0.0.md,fixed.md}` `docs/Tasks/reflect/.gitkeep` `docs/Tasks/scan-project/.gitkeep` 全部存在
14. 若 `<cwd>/.git/` 存在：`git status --porcelain` 不含 `.env`（非 `.example`）；`git ls-files .env` 為空

### 10. 收尾

- 回報：harness 路徑 / 參數 / 產了什麼 / 跳過了什麼（既存骨架、既存檔）/ acceptance 結果
- 若 `.git/` 存在 → `AskUserQuestion`：**建立 commit (Recommended)** / 先不 commit。commit 訊息 `(AI) Add: 套用 Harness-Engineering 並初始化 Next.js + FastAPI 骨架`（`--refresh` 用 `(AI) Modify: 更新 harness 設定（CLAUDE.md / AGENTS.md / hooks / skills）`）。**不 push**（push 走 `/commit-all`）
- 下一步提示：`/start-dev` → 寫 `docs/Tasks/v1.0.0/propose-v1.0.0.md` → `/propose-to-tasks` → `/harness-scan` → `/harness-reflect`

## 自我約束

- **禁**刪除任何目錄或檔案（含 harness、含暫存）；dry-run 暫存交給 OS
- **禁** `--force` 覆寫既存 `frontend/` `backend/`
- **禁**自寫規則字句 / 版本號 / 骨架程式碼
- **禁**把任何機密寫進會被 git 追蹤的檔；**禁**經 `AskUserQuestion` 收密碼
- **禁**未經同意安裝工具、改 PATH、改 shell profile
- **禁** `git push`
- 使用者在任一 `AskUserQuestion` 選「中止」→ 整個流程停止，不部分執行後續步驟
