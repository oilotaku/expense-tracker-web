---
name: harness-scan
description: 掃描 Next.js + FastAPI + PostgreSQL (+ Redis) 專案，按 area（env / fe / be / db / cache / sec）派唯讀 sub-agent 並行，依本檔的掃描規則 ID（R-xxx）輸出累積式問題報告到 `docs/Tasks/scan-project/scan-{YYMMDDHHMMSS}.md`，每條對應 `rules/` 規範 ID。也是 PR 前的獨立評分者。當使用者說「掃描 / scan / code review / 找問題 / 評分 / 檢查有沒有違規」時觸發。不適用：想直接修問題（本 skill 只報告，修改另開 task）、非本棧專案、只想跑 lint（直接跑 `npm run lint` / `ruff`）。
---

# harness-scan

掃描專案，輸出累積式問題清單（時間戳分檔於 `docs/Tasks/scan-project/`）。範圍涵蓋程式碼、本地服務組態、compose / CI 檔；**不**涵蓋部署平台。

本檔是掃描規則（`R-xxx`）的**唯一來源**：Claude Code 以 skill 載入；Codex / Cursor / Cline / Aider 直讀本檔（見 `skills/README.md § 跨工具入口`）。`regression/scan-eval/expected.json` 以本檔的 `R-xxx` 為基準——**改規則改本檔，同 PR 在 `regression/scan-eval/` 埋對應違規**。`scripts/check-rules.mjs` 驗每條 `R-xxx` 唯一且「對應規範」存在。

shell 只用於唯讀指令（`git log` / `grep` / `ls`）；**禁**任何寫入或 git 變更操作。

## 參數

| 名稱 | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `focus` | `all \| env \| frontend \| backend \| db \| cache \| sec \| pii` | `all` | 非 `all` 時只跑該區 + F/G（安全與 PII 永遠跑） |

## 不適用

- 非本 harness 鎖定棧（Next.js App Router / FastAPI / SQLAlchemy 2 / PostgreSQL / Redis）
- 想直接修問題（本 skill 只報告；修改由 worker 另起 task 或手動）
- 只想跑 lint（直接跑 `npm run lint` / `ruff`）

## 身分與風格

資深軟體工程師（非 linter）；PR 的獨立 reviewer（worker 自評不算驗證）。嚴謹、白話、以證據為本。掃描規則是地板；AD 寧空勿湊。語言 `→ CORE-004`。

---

## 規則 ID 說明

- **`R-{區}-{序號}`**：本檔自己的**掃描規則 ID**（偵測手段 + 嚴重度），與 `rules/` 的規範 ID 不同層
- **對應規範**：每條掃描規則對應的 `rules/` 規範 ID（`CORE-NNN` / `FE-NNN` / `BE-NNN` / `DB-NNN` / `CACHE-NNN` / `CICD-NNN`）；報告中每條發現**必**同時列出兩者，`fixed.md` 的 `rule:` 欄填**規範 ID**，不填 `R-xxx`
- 「對應規範」欄一律填實際 ID；無對應規則時填規範檔路徑（`rules/<area>/<file>.md`）
- **`AD-{序號}`**：規則外的專案特定問題（Architecture / Domain）

---

## 心法

1. 先跑通用 `R-xxx`、再找 `AD-xxx`。至少巡：邏輯邊界 / 效能（N+1、阻塞、re-render）/ 商業邏輯（transaction、狀態機、race）/ 啟動 / 維運盲點
2. 依「組成偵測」跳過不存在類別；`focus` 非 `all` 時只跑該區 + F/G（安全與 PII 永遠跑）
3. 規則與脈絡衝突 → 跳過註明，不硬套
4. 報告白話；路徑 `相對路徑:行號`；修正具體到「改哪檔 / 第幾行 / 改成什麼」
5. 違規多時先給 🔴 + 🟠，結尾問「幫你修 Critical？」
6. 寫新報告前先讀 `docs/Tasks/scan-project/` 最新一份做差異基準
7. **AD 寧空勿湊**：判準「誰會痛？痛多少？」；不回報偏好性意見 / 規則換包裝 / 無後果風險 / 框架等效寫法
8. **只報告不修**：僅允許寫入一個報告檔；**禁**改其他檔、**禁**任何 git 操作
9. **唯讀 sub-agent、證據為本、累積式**：sub-agent 只回「結論 + `相對路徑:行號`」不回全文；新檔不覆寫

## 定位 harness

解析 `HARNESS_HOME`：`<cwd>/.claude/harness.local.json` 的 `harness_home` → env `HARNESS_HOME` → `<cwd>/harness/` → `<cwd>/../Harness-Engineering/` → `<cwd>/../harness/`（同 `AGENTS.md § Harness` / `harness-init § 1`）；找不到 → 中止並提示先跑 `/harness-init`。以下 `rules/…` 皆以 `<harness>` 為根。

## 前置讀取

`AGENTS.md` / `rules/00-core/00-overview.md`（永遠）+ 依偵測到的分區載入 `rules/<area>/*.md`（對照 `AGENTS.md § Just-in-time Loading`）/ `docs/Rules/*.md`（專案級規則 `PROJ-NNN`，違反同樣列入報告；略過 `README.md` 與 `_` 開頭檔）/ `docs/Arch/*`（ADR）/ 當版 `docs/Tasks/v*/tasks-v*.md` 與 `fixed.md` / `docs/Tasks/scan-project/` **最新一份**（只讀最新，不預載歷史）。

## 組成偵測

| 區 | 訊號 | 無 |
| --- | --- | --- |
| A `ENV` | `os.getenv` / `pydantic_settings` / `process.env`；`.env*` 檔 | 跳 |
| B `FE` | `frontend/package.json` 含 `next`；`app/` 目錄；`next.config.*` | 跳 |
| C `BE` | `backend/pyproject.toml` 含 `fastapi` | 跳 |
| D `DB` | `alembic/`；`sqlalchemy` import；`asyncpg` | 跳 |
| E `CACHE` | `pyproject.toml` 含 `redis`；compose 有 `redis` service；`REDIS_URL` | 跳 |
| F `SEC` | 有 B 或 C | 純文件跳 |
| G `PII` | DB schema 含 email / phone / name / address / id_number / birth | 跳 |

`git log` 類偵測需 `.git/`；無則跳過並註明。

## 嚴重度

| 🔴 | 🟠 | 🟡 | 🔵 | ⚪ |
| --- | --- | --- | --- | --- |
| Critical | High | Medium | Low | Info |

---

## A. ENV（環境 / 機密 / repo 衛生 / 依賴）

| 掃描規則 | 嚴重度 | 偵測 → 修正 | 對應規範 |
| --- | --- | --- | --- |
| **R-ENV-001** 機密寫死 | 🔴 | grep `(password\|token\|secret\|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']` / `sk-` / `ghp_` / `AKIA` / `eyJ` / 連線字串帶帳密 → 改 env + rotate | → CORE-024 |
| **R-ENV-002** 缺 `.env.<env>.example` | 🟠 | 每層 `.env.<env>` 須有對應 `.env.<env>.example` | → CORE-028 |
| **R-ENV-003** `.env` 未 gitignore | 🔴 | 已追蹤須 `git rm --cached` + rotate | → CORE-027 |
| **R-ENV-004** env 與 example key 不一致 | 🟡 | 比對 key 集合差集 | → CORE-029 |
| **R-ENV-005** 命名非 UPPER_SNAKE | 🔵 | `.env*` / `Settings` 欄位 | → CORE-025 |
| **R-ENV-006** `.env` 曾被 commit | 🔴 | `git log --all -- .env` 有結果 → 全 key rotate | → CORE-030 |
| **R-ENV-007** 版本數字散落 | 🔵 | Dockerfile / compose / CI 硬寫 image tag 或版本，未引用版本表 | → CORE-019 |
| **R-ENV-008** PostgreSQL volume 掛錯路徑 | 🟠 | compose `db` volume 目標為 `/var/lib/postgresql/data`（18+ 須 `/var/lib/postgresql`，否則 unused mount / 資料落在容器層） | → CICD-051 |
| **R-AI-001** 硬編碼 IP / URL / magic | 🟡 | 非 `localhost` 的 IP / 網域寫死在程式 → env | → CORE-040 |
| **R-AI-002** 疑似幻覺函式 / API | 🟠 | import 找不到 / 套件無此 export / 文件查無 | → rules/00-core/00-overview.md |
| **R-AI-003** TODO 未追蹤 | 🔵 | `TODO\|FIXME\|XXX\|HACK\|暫時\|之後再改` 未對應 task | → rules/00-core/10-propose-tasks-fixed.md |
| **R-AI-004** 可疑相依套件 | 🟠 | typo-squatting；未在版本表；2 年無維護 | → CORE-022 |
| **R-GIT-001** 產物被追蹤 | 🟠 | `node_modules` / `.venv` / `.next` / `dist` / `__pycache__` 在 git | → CORE-027 |
| **R-GIT-002** commit message 不符規範 | 🔵 | 不符 `^(\(AI\) )?(Add\|Modify\|Fix\|Refactor\|Docs): ` | → CORE-087 |
| **R-GIT-003** AI commit 缺 `(AI)` | 🔵 | 訊息含 `claude` / `copilot` / `codex` 但無前綴 | → CORE-088 |
| **R-DEP-001** 缺 lock file | 🟠 | 無 `package-lock.json` / `uv.lock` | → CICD-011 / → CICD-017 |
| **R-DEP-002** 執行環境版本未 pin | 🟡 | 無 `engines.node` / `requires-python` / `.python-version` | → CORE-018 |
| **R-DEP-003** 套件版本浮動 | 🟠 | `^` / `~` / `*` / `>=` | → CORE-017 |
| **R-DEP-004** 未做依賴掃描 | 🔵 | CI 無 `npm audit` / `pip-audit` job | → CICD-025 |

## B. FE（Next.js App Router）

| 掃描規則 | 嚴重度 | 偵測 → 修正 | 對應規範 |
| --- | --- | --- | --- |
| **R-FE-001** Token 存 localStorage | 🔴 | `localStorage.setItem(.*token` → httpOnly cookie | → BE-026 / FE-035 |
| **R-FE-002** `dangerouslySetInnerHTML` | 🔴 | → 文字節點 / DOMPurify | → CORE-112 |
| **R-FE-003** 元件直呼 `fetch` / `axios` | 🟡 | ≥ 3 處非 `lib/api/*` → 集中 RTK Query | → FE-024 |
| **R-FE-004** 硬寫使用者語言 literal | 🔵 | → i18n key | → FE-009 |
| **R-FE-005** 缺 Loading / Empty / Error 三態 | 🟡 | 列表 / 詳情頁缺任一態 | → FE-048 |
| **R-FE-006** 送出按鈕未 disable | 🟡 | mutation `isLoading` 未綁 `disabled` | → FE-048 |
| **R-FE-007** 後端 error 直顯 | 🟡 | 直接 render `detail` → `error_code` 對應 i18n | → FE-029 |
| **R-FE-008** 路由缺權限控制 | 🟠 | 受保護 route group 無 `middleware.ts` / server-side 檢查 | → FE-037 |
| **R-FE-009** 客戶端用無 `NEXT_PUBLIC_*` 前綴 env | 🔴 | `"use client"` 檔內 `process.env.X` 且 X 無前綴 | → FE-030 |
| **R-FE-010** 用 `any` | 🟠 | → `unknown` + 型別守衛 | → FE-004 |
| **R-FE-011** 不必要 re-render | 🟡 | 先偵測 React Compiler（`next.config.*` 含 `reactCompiler` / `babel-plugin-react-compiler`）：已啟用 → 回報**殘留**手動 `useCallback` / `useMemo` / `React.memo`；未啟用 → render 內字面值 / callback 未 memo / 列表元件未 memo | → FE-006 |
| **R-FE-012** 用原生 `alert` / `confirm` / `prompt` | 🟠 | → 共用 dialog 元件 | → FE-049 |
| **R-FE-013** build-time env 改值未重 build | 🟡 | `NEXT_PUBLIC_*` 變更後 `.next/` 仍舊值 | → FE-033 |
| **R-FE-014** 缺 `error.tsx` / `not-found.tsx` | 🟡 | route group 無錯誤邊界 | → FE-014 |
| **R-FE-015** Server Component 內用 client-only API | 🟠 | 無 `"use client"` 卻用 `useState` / `useEffect` / `window` | → FE-011 |
| **R-FE-016** server-side fetch 用 `NEXT_PUBLIC_API_URL` | 🟡 | Server Component / route handler 應用 `API_INTERNAL_URL` | → FE-023 |
| **R-FE-017** 缺 `error.tsx` 未上報 | 🔵 | 錯誤邊界未呼叫 `@sentry/nextjs` `captureException` | → FE-020 |
| **R-FE-018** 字級 < 下限 | 🔵 | Tailwind `text-[<12px]` / 自訂 class | → FE-059 |
| **R-FE-019** 日期時間未帶時區 | 🟡 | `new Date(str)` 無 offset / 顯示未經 `Asia/Taipei` 格式化 | → CORE-047 / FE-039 |
| **R-FE-020** API 型別手寫 / schema 漂移 | 🟡 | 無 `src/lib/api/schema.d.ts`、endpoint 型別非 `components['schemas'][…]`、或重產後 `git diff` 有差異 | → FE-066 |
| **R-TEST-003** TS 未 `strict` | 🔵 | `tsconfig.json` `strict` 非 `true` | → FE-004 |

## C. BE（FastAPI）

| 掃描規則 | 嚴重度 | 偵測 → 修正 | 對應規範 |
| --- | --- | --- | --- |
| **R-BE-001** 路徑非 `/api/v{n}/*` | 🟠 | 排除 `/health` / `/version` / `/api/docs` | → BE-010 |
| **R-BE-002** 動詞命名 endpoint | 🟡 | → REST + kebab 複數 | → BE-010 |
| **R-BE-003** Response 外殼不統一 | 🟠 | → `ApiResponse[T]` | → BE-013 |
| **R-BE-004** 路由用 `dict` 當 response type | 🟠 | → Pydantic schema | → BE-015 |
| **R-BE-005** 受保護 endpoint 缺 `Depends(require_*)` | 🔴 | 非公開路由無 deps | → BE-024 |
| **R-BE-006** 仍用 `on_event` | 🟡 | → `lifespan` | → BE-047 |
| **R-BE-007** `docs_url` 未依環境關閉 | 🟠 | production 未關閉或未 Basic auth | → CORE-051 |
| **R-BE-008** CORS `allow_origins=["*"]` + `allow_credentials=True` | 🔴 | → `settings.CORS_ORIGINS` | → BE-030 / BE-031 |
| **R-BE-009** 回傳帶內部欄位 | 🟠 | `password_hash` / `deleted_at` / 自增 `uid` → DTO 過濾 | → BE-016 / BE-011 |
| **R-BE-010** 無輸入驗證 | 🟠 | 路由參數直接 `dict` / `Request.json()` → Pydantic Request schema | → BE-015 |
| **R-BE-011** `data` 直接為 array | 🟠 | → `{items: [...], total}` | → BE-014 |
| **R-BE-012** `detail` 洩漏內部 | 🔴 | SQL / traceback / table 名 → 通用訊息 + `code` | → BE-016 |
| **R-BE-013** 缺 3 個 exception handler | 🟠 | `AppException` / `RequestValidationError` / `Exception` | → BE-049 |
| **R-BE-014** 跨層呼叫 | 🟡 | api → repository / service → raw SQL | → BE-002 |
| **R-BE-015** 第三方未集中 `clients/` | 🟡 | `httpx` 散落 service | → BE-058 |
| **R-BE-016** 用 `Any` / `typing.List` / `typing.Dict` | 🔵 | → `object` / 內建泛型 | → BE-006 / BE-007 |
| **R-BE-017** 函式缺型別標註 | 🔵 | `mypy app` 報 `no-untyped-def` | → BE-005 |
| **R-BE-018** bcrypt 在 async 裸呼叫 | 🟠 | → `*_async` 版（`asyncio.to_thread`） | → BE-028 |
| **R-BE-019** 多表寫入無 transaction | 🟠 | → `async with db.begin():` | → BE-038 |
| **R-BE-020** production 啟動無 fail-fast | 🟠 | `Settings` 無 secret ≥ 32 字元 / 非預設值驗證 | → CORE-032 / BE-044 |
| **R-BE-021** logger 未用 `exception` | 🟡 | `except:` 內 `logger.error` 丟 traceback | → BE-052 |
| **R-BE-022** 測試 mock SQL | 🟠 | `MagicMock(AsyncSession)` → compose 真實 Postgres（Redis 版 → R-CACHE-005） | → BE-079 |
| **R-BE-023** httpx 無 timeout | 🟠 | `httpx.AsyncClient()` 無 `timeout=` | → BE-061 |
| **R-BE-024** 缺 secure headers middleware | 🟠 | `main.py` 無 `SecureHeadersMiddleware` 或順序錯 | → BE-032 / BE-033 |
| **R-BE-025** 401 / 403 混用或 200 帶錯誤 | 🟠 | → 正確 status | → BE-021 / BE-018 |
| **R-LOG-001** 缺 `/api/v1/health` | 🟡 | 須回 `{db, redis}` 狀態 | → CICD-081 / CACHE-025 |
| **R-LOG-002** production debug log 開 | 🟠 | `LOG_LEVEL=DEBUG` / `debug=True` | → BE-057 |
| **R-LOG-003** Sentry 未初始化或位置錯 | 🟡 | 非 `app/clients/sentry/` | → BE-072 |
| **R-LOG-004** 缺 graceful shutdown | 🟠 | `lifespan` 未 `await engine.dispose()` / redis `aclose()` | → DB-045 / CACHE-005 |
| **R-LOG-005** Log 缺結構化欄位 | 🟡 | 無 `request_id` / 時間非 ISO 8601 帶 offset | → BE-055 / CORE-045 |
| **R-LOG-006** 缺 `/api/v1/version` | 🔵 | | → CICD-081 |
| **R-TEST-001** 無測試 | 🟡 | 後端無 `tests/` / 未設 `asyncio_mode`；前端無 `vitest` config / `*.test.tsx` | → BE-076 / CICD-013 |
| **R-TEST-002** 無 CI | 🔵 | 無 `.github/workflows/ci.yml` | → CICD-001 |
| **R-TEST-004** 後端 mock SQL | 🟠 | 已併入 R-BE-022，ID 保留不重用 | → BE-079 |
| **R-TEST-005** 第三方測試未用 `respx` / `MockTransport` | 🔵 | 直接打外部 | → BE-082 |

## D. DB（SQLAlchemy 2 async + PostgreSQL）

| 掃描規則 | 嚴重度 | 偵測 → 修正 | 對應規範 |
| --- | --- | --- | --- |
| **R-DB-001** 無 alembic | 🟠 | 無 `alembic/` / `alembic.ini` | → DB-054 |
| **R-DB-002** 缺必備欄位 | 🟡 | `<table>_uid = public_uid()` / `is_deleted` / `created_at` / `updated_at`（`created_by` / `updated_by` nullable） | → DB-002 / DB-004 |
| **R-DB-003** 密碼明文 / 弱雜湊 | 🔴 | md5 / sha1 → bcrypt / argon2 | → BE-027 |
| **R-DB-004** SQL 字串拼接 | 🔴 | f-string / `%` 進 `text()` → ORM / `bindparams` | → DB-030 |
| **R-DB-005** 金額 FLOAT / DOUBLE | 🟠 | → `Numeric(18, 2)` / 整數分 | → DB-037 |
| **R-DB-006** 無軟刪除 | 🟡 | `session.delete()` 於業務表 | → DB-012 |
| **R-DB-007** Binary 存 DB | 🟠 | `LargeBinary` 存檔案 → 物件儲存 | → rules/30-database/00-overview.md |
| **R-DB-008** 常查欄位無索引 / 索引命名錯 | 🔵 | `WHERE` 常用欄無 index；索引名不符 `idx_{table}_{cols}` | → DB-056 / DB-007 |
| **R-DB-009** Repository 不過濾 `is_deleted` | 🟠 | 預設須過濾；不過濾版命名 `_including_deleted` | → DB-020 / → DB-022 |
| **R-DB-010** 未繼承 `Base` / 未用 `mapped_column` | 🔵 | 舊式 `Column()` | → DB-001 |
| **R-DB-011** 每請求建立 engine / 連線 | 🟠 | → lifespan 單一 `async_sessionmaker` | → DB-041 |
| **R-DB-012** Migration 修改既有 revision | 🔴 | 已 merge 的 revision 被改 → 建新 revision | → DB-053 |
| **R-DB-013** 時間欄位無時區 | 🔴 | `DateTime()` 無 `timezone=True` / `TIMESTAMP` 非 `TIMESTAMPTZ` / naive `datetime.now()` | → CORE-042 / DB-003 |
| **R-DB-014** 對外暴露自增主鍵 | 🟠 | API 路徑 / response / 外鍵目標用自增 `uid`（或 `id`）而非 `<table>_uid` | → DB-013 / BE-011 |
| **R-DB-015** 連線池參數散落 | 🔵 | `pool_size` 等未集中於 `app/db/session.py` | → DB-043 |
| **R-DB-016** Migration 含 `DROP` | 🔴 | `op.drop_table` / `op.drop_column` 無前置備份 task | → DB-033 / CORE-139 |
| **R-DB-017** `*_uid` 欄無索引 / 未經工廠 | 🟡 | 自家 `<table>_uid` 手寫 `mapped_column(PG_UUID` 而非 `public_uid()`；外鍵 `*_uid` 無 `index=True` / `Index(` | → DB-015 / DB-016 / DB-055 |

## E. CACHE（Redis）

| 掃描規則 | 嚴重度 | 偵測 → 修正 | 對應規範 |
| --- | --- | --- | --- |
| **R-CACHE-001** key 命名不符 | 🟡 | 非 `{app}:{domain}:{id}` / 大寫 / 空白 / 裸 f-string 散落 | → CACHE-009 / CACHE-010 |
| **R-CACHE-002** 寫入無 TTL | 🟠 | `set(` / `hset(` / `sadd(` 無 `ex=` 且無後續 `expire(` | → CACHE-012 |
| **R-CACHE-003** 用 `KEYS` | 🟠 | `.keys(` → `scan_iter` | → CACHE-016 |
| **R-CACHE-004** 用 `FLUSHALL` / `FLUSHDB` | 🔴 | 含 `redis-cli` / 測試 fixture / compose command | → CACHE-017 |
| **R-CACHE-005** 測試 mock Redis | 🟠 | `fakeredis` / `MagicMock(Redis)` → compose 真實 redis | → CACHE-026 |
| **R-CACHE-006** 非 `redis.asyncio` | 🟠 | `import aioredis` / 同步 `redis.Redis` 在 async 路徑 | → CACHE-004 |
| **R-CACHE-007** 多個 client 實例 | 🟡 | 非 lifespan 單一 client 掛 `app.state` | → CACHE-005 |
| **R-CACHE-008** Redis 當唯一真相 | 🔴 | 資料只存 Redis 無 DB 對應 | → CACHE-002 |
| **R-CACHE-009** 無 fallback 行為 | 🟠 | Redis 不可用時未定義 degrade / fail | → CACHE-007 |
| **R-CACHE-010** value 非 JSON / 無版本 | 🔵 | `pickle` / 結構變更未遞增 `VERSION` | → CACHE-015 / CACHE-011 |
| **R-CACHE-011** rate limit 非 sorted set pipeline | 🟡 | 用 `INCR` 固定視窗 / 非原子 | → CACHE-022 |
| **R-CACHE-012** `/health` 缺 redis 狀態 | 🔵 | 未回 `redis: ok/degraded/disabled` | → CACHE-025 |

## F. SEC

| 掃描規則 | 嚴重度 | 偵測 → 修正 | 對應規範 |
| --- | --- | --- | --- |
| **R-SEC-001** JWT `alg: none` / secret < 32 | 🔴 | → HS256 / RS256 + fail-fast | → BE-022 / CORE-032 |
| **R-SEC-002** 敏感端點無 rate limit | 🟠 | `/login` / `/register` / `/forgot-password` | → BE-034 / CACHE-022 |
| **R-SEC-003** 缺安全 headers | 🟠 | CSP / X-Frame / X-Content-Type / HSTS | → BE-032 |
| **R-SEC-004** `eval` / `exec` | 🔴 | Python `eval(` / JS `new Function(` | → CORE-129 |
| **R-SEC-005** 登入錯誤訊息洩露帳號 | 🟡 | 區分「帳號不存在」 | → BE-029 |
| **R-SEC-006** 檔案上傳無限制 | 🟠 | 副檔名白名單 + mime + 大小 + 隨機檔名 | → CORE-131 |
| **R-SEC-007** 錯誤 response 洩漏內部 | 🟠 | 同 R-BE-012 但含前端 console | → BE-016 |
| **R-SEC-008** 權限只前端擋 | 🔴 | 後端無對應 `Depends` | → BE-024 |
| **R-SEC-009** 資源 ID 用序號 | 🔵 | → `<table>_uid`（UUID） | → DB-013 / DB-015 |
| **R-SEC-010** CI 缺 secret-scan / sast | 🟠 | `ci.yml` 無 `secret-scan` / `sast` job；gitleaks allowlist 排除 `docs/` | → CICD-030 / → CICD-033 |
| **R-SEC-011** Dockerfile 以 root 執行 | 🟡 | 無 `USER` 指令 | → CICD-058 |

## G. PII

| 掃描規則 | 嚴重度 | 偵測 → 修正 | 對應規範 |
| --- | --- | --- | --- |
| **R-PII-001** log 印 PII / 機密 | 🔴 | `password / token / email / phone / id_number / credit_card` → 遮罩 | → DB-029 / BE-053 |
| **R-PII-002** PII 欄位無標註 | 🔵 | `comment="PII"` | → DB-028 |
| **R-PII-003** 缺 audit log | 🟠 | 登入 / 改密碼 / 匯出 / 權限變更須記錄 | → CORE-137 |
| **R-PII-004** PII 進 Redis 無 TTL 或明文 | 🟠 | session / cache 存 email / phone 未遮罩 | → CACHE-021 / DB-029 |

---

---

## 執行（Claude Code）

### 1. 前置讀取（主 agent）

依〈前置讀取〉：`CLAUDE.md` / `AGENTS.md` / `rules/00-core/00-overview.md` / `docs/Rules/*.md`（略過 `README.md`、`_` 開頭）/ `docs/Arch/*` / 當版 `docs/Tasks/v*/tasks-v*.md` / 當版 `fixed.md` / `docs/Tasks/scan-project/` **最新一份**（差異基準）。不預載歷史版本。

### 2. 組成偵測

依〈組成偵測〉表決定要派哪些 area；不存在的類別直接列入「已跳過類別」。`focus` 非 `all` 時只派該 area（+ F/G）。

### 3. 派唯讀 sub-agent（並行）

每個 area 一個 `Agent`（`subagent_type: Explore`，唯讀），一次送出：

| area | 掃描範圍 | 套用規則段 |
| --- | --- | --- |
| env | `.env*` `.gitignore` `.gitleaks.toml` `git log --all -- .env` | A. ENV（含 GIT / DEP） |
| fe | `frontend/` | B. FE |
| be | `backend/app/` | C. BE（含 LOG / TEST） |
| db | `backend/app/models/` `backend/alembic/` | D. DB + G. PII |
| cache | `backend/app/clients/redis*` 及所有 `redis` 引用 | E. CACHE |
| sec | 全專案（auth / headers / upload / eval） | F. SEC |

每個 sub-agent 的 prompt 必含：
- 該 area 的規則段**原文**（從本檔摘出，不改寫）
- `docs/Tasks/v*/fixed.md` 內已登錄的條目（避免重報；命中者標「— 見 fixed.md §N」）
- 前次報告該 area 的條目（供 🆕 / ✅ / ⏸ / 🔄 標記）
- 回傳格式：每條 `[ID] 嚴重度 | 相對路徑:行號 | 白話 | 具體修法`；**禁**回檔案全文
- 明示：唯讀；禁寫檔；禁 git

弱工具地板：預估檔案 > 200 個 / context > 100K tokens 才需拆 sub-agent，否則直掃；Claude Code 可並行即並行，不受閾值限制。sub-agent 回傳超過 200 行 → 要求重新精簡，不直接塞進報告。

### 4. 彙整與寫報告

- 合併各 area 結果，去重（同檔同行同 ID 只留一條）、依嚴重度排序
- 檔名時戳用 Node `new Date()` 或 PowerShell `Get-Date -Format yyMMddHHmmss` 取，不手算
- 章節順序、每條格式、「與前次差異」規則**完全依〈產出〉**
- 規則引用用本 harness 的 ID（`CORE-NNN` / `FE-NNN` / `BE-NNN` / `DB-NNN` / `CACHE-NNN` / `CICD-NNN`）

### 5. 回報

摘要：🔴 N 🟠 N 🟡 N 🔵 N ⚪ N、報告路徑、已跳過類別；結尾問「幫你修 Critical？」（修是另一個 task，不在本 skill）。

---

## 產出

寫入 `docs/Tasks/scan-project/scan-{YYMMDDHHMMSS}.md`（12 位：年末兩碼 + 月日時分秒，`Asia/Taipei`）。每次新檔，不覆寫。

寫入前**先讀最新一份** `docs/Tasks/scan-project/scan-*.md`（依檔名排序取最大）做差異基準；無舊檔則第 0 章省略。

**僅允許寫入報告檔**；**禁**修改其他檔；**禁**自動 git。

若違規已記錄於當版 `fixed.md`，項目尾段附 `— 見 fixed.md §N` 並視為已處理。

章節順序：

0. **與前次差異**（僅當有舊報告）— 以 `R-xxx` / `AD-xxx` ID + 路徑為 key：🆕 新增 / ✅ 已修 / ⏸ 未動 / 🔄 變化
1. **總覽** — 時間 / 分區 / 🔴N 🟠N 🟡N 🔵N ⚪N / 結論（PR gate 用：🔴 = 0 且 🟠 = 0 才可 self-approve）
2. **專案摘要** — 目標 / 技術棧對照 / 目錄結構 / Task 進度 / 完成度
3. **詳細發現**（依嚴重度）
   ```
   ### 🔴 [R-ENV-001 → CORE-NNN] 機密寫死
   - 檔案：`相對路徑:行號`
   - 內容 / 白話 / 修正（具體） / 首次發現：YYYY-MM-DD
   ```
4. **修正優先序** — 立刻 / 本週 / 有空
5. **已跳過分區**（必列原因）
6. **AD-xxx**（空可接受，須列已巡視面向）
7. **規範自身問題** — `rules/` 矛盾 / 缺漏 / 掃描規則的「對應規範」仍為 `?` 佔位

---

## Acceptance（必跑，任一失敗不報告完成）

1. 報告檔已寫入 `docs/Tasks/scan-project/scan-{YYMMDDHHMMSS}.md`
2. 報告含全部 7 章節（總覽 / 摘要 / 詳細發現 / 優先序 / 跳過分區 / AD / 規範自身）
3. 每條發現含掃描規則 ID + 對應規範 ID + 「相對路徑:行號」+ 具體修正建議
4. **禁**：修改任何非報告檔；**禁**：任何 git 寫入操作
5. 若有舊報告 → 第 0 章「與前次差異」非空（🆕 / ✅ / ⏸ / 🔄）
6. `focus` 非 `all` 時，報告總覽註明範圍，且 F / G 仍執行
7. `git status --porcelain` 只多出這一個報告檔；每個派出的 sub-agent 皆為唯讀型，主 agent 未執行任何 `git` 寫入指令

---

## 自我約束

- 「相對路徑:行號」+ 修正具體到「改哪檔 / 第幾行 / 改成什麼」
- **不回報**：偏好性意見 / 規則換包裝 / 無後果風險 / 框架等效寫法
- 多違規先 🔴 + 🟠，結尾問「幫你修 Critical？」
- 僅寫入報告檔；**禁**修改其他檔或執行 git
- sub-agent 一律唯讀，只回結論與路徑，不回全文
