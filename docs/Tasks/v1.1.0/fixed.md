# Fixed v1.1.0

## §1 — `msw` 從未成為前端真實依賴，task-013 無法依 FE-012 寫 HTTP mock 測試（既存自 v1.0.0）

- **time**: 2026-09-04T22:04:37+08:00
- **commit**: pending
- **files**: `frontend/package.json`、`frontend/package-lock.json`
- **問題**: task-013（Dashboard 彙總 API 前端串接）要求 `dashboardApi.test.ts` 用 msw mock `GET /api/v1/dashboard/summary` 的成功/422/401 三種回應（`→ FE-012` 禁 mock `fetch` / RTK hook 本身）。實際檢查 `frontend/package.json` 的 `dependencies` / `devDependencies` 皆無 `msw`；`package-lock.json` 內唯一出現的 `msw` 是 `@vitest/mocker` 的 **optional peerDependency**（`peerDependenciesMeta.msw.optional: true`），`npm ci` 不會安裝。`node_modules/msw` 實際不存在。追溯 `git log --all -- frontend/package.json`：初始 scaffold（commit `57c8b1d`）就只在 `allowScripts` 註解列了 `"msw": true`（CORE-145 的 install-script 核可清單），從未把 `msw` 加進 `dependencies`/`devDependencies`；task-006（commit `902c67b`，「安裝 v1.1.0 前端新增依賴」）也只裝了 recharts/react-hook-form/zod/cva/radix-dialog/framer-motion，未補 `msw`。既有測試（`budgets/page.test.tsx`、`TransactionForm.test.tsx`、`AuthGuard.test.tsx` 等）皆繞過此洞，直接 mock RTK Query hook 的回傳值（檔內註解自陳「msw 尚未成為 devDependency」），因為那些測試測的是「頁面元件如何呈現 hook 的回傳值」，不需要真的發 HTTP request；但 task-013 要測的是 `dashboardApi.ts` **這個 RTK Query endpoint 本身**（`transformResponse` / query string 組裝 / 422 / 401 對應行為），沒有 msw 就無法在不違反 FE-012（禁 mock fetch）的前提下驗證。
- **根因**: scaffold 階段（`/harness-init` 產出的模板）把 `msw` 登記進了 `allowScripts` 核可清單（預期未來會用到），但初始化流程漏了把它實際加進 `package.json` 的 `devDependencies` 並跑鎖檔；`rules/00-core/01-versions.md` 已把 `msw 2.15.0` 列為版本唯一真相（供 FE-012 使用），但落地的 scaffold 產物與版本表脫節，且此落差直到 v1.0.0 全期都沒有被踩到——因為 v1.0.0 所有測試都選擇「mock hook」而非「mock HTTP」的路徑，從未真正需要 import `msw`。task-013 是本專案第一個明確要求 msw-based endpoint 測試的 task，才第一次暴露這個從 scaffold 就存在的落差。
- **修正**: 未修正（worker 判斷屬 CORE-140「發現需改動 affected_files 以外的檔才能過」→ 停手，不擅自把 `msw` 加進 `frontend/package.json`/`package-lock.json`，因為這兩個檔不在 task-013 的 `affected_files` 清單內，且多個並行 worker 共用同一份工作目錄、無 git worktree 隔離，貿然 `npm install` 改動鎖檔有撞到其他 worker 的風險）。建議：另拆一個獨立、優先序高於 task-013/019/020 的小 task（例如 task-013b「補齊前端 msw devDependency」），`affected_files` 明確列 `frontend/package.json`、`frontend/package-lock.json`，鎖版 `msw@2.15.0`（`→ rules/00-core/01-versions.md`）；完成後 task-013（本 task）、task-019（categoriesApi）、task-020（accountsApi）三個要求 `*Api.test.ts` 的 task 才能真正滿足 FE-012。
- **rule**: FE-012
- **後續**: task-013 本次標記 `blocked`（見 `docs/Tasks/v1.1.0/tasks/task-013-dashboard-api-integration.md` frontmatter）；`frontend/src/lib/api/dashboardApi.ts` 本體實作已完成並通過 `npm run typecheck` 全綠、`npx eslint src/lib/api/dashboardApi.ts --max-warnings=0` 全綠（隔離驗證，因全專案 `npm run lint` 另受 §2 環境污染影響），可供後續 worker 直接補測試檔沿用，不需重新實作。reflect 候選：`/harness-init` scaffold 模板應同步修正，把 `msw` 從 `allowScripts` 註解升級為真實 `devDependency`，避免同類落差在其他專案重演。

## §2 — 工作目錄殘留未追蹤的 `frontend/playwright-report/`，導致全專案 `npm run lint` 誤掃產出檔（既存，環境污染）

- **time**: 2026-09-04T22:04:37+08:00
- **commit**: pending
- **files**: `frontend/playwright-report/`（gitignored，非版控檔，本條僅記錄現象，不列入 task-013 `affected_files`）
- **問題**: 依 AGENTS.md Build/Test/Lint 執行 `docker run ... node:24-alpine sh -c "npm run lint"`（全專案指令）時，`eslint .` 對 `frontend/playwright-report/trace/assets/*.js`（Playwright trace viewer 產出的第三方 bundle）掃出大量 `@typescript-eslint/no-unused-expressions` warning，超過 `--max-warnings=0` 門檻導致 lint 指令整體失敗；此目錄已列在 `.gitignore:43`（`playwright-report/`），未被 git 追蹤，也不是本次 task-013 改動造成，應是先前某次本機 `npm run e2e` 執行後留下的產出物，未清除。
- **根因**: `frontend/eslint.config.mjs` 的 `globalIgnores` 只排除 `.next/**`、`out/**`、`coverage/**`、`next-env.d.ts`、`src/lib/api/schema.d.ts`，未包含 `playwright-report/**`；`.gitignore` 排除版控追蹤，但 `eslint .` 是對「磁碟上的檔案」掃描，不看 `.gitignore`，兩者規則集不同步，導致「不進版控」≠「不進 lint 掃描範圍」。
- **修正**: 未修正（`frontend/eslint.config.mjs` 不在 task-013 `affected_files` 內，且刪除該目錄需要遞迴刪除，屬本專案「毀滅性操作禁止」政策下應避免自行執行的操作；本 worker 改以 `npx eslint src/lib/api/dashboardApi.ts --max-warnings=0` 針對新增檔案單獨驗證，確認 `dashboardApi.ts` 本身無 lint 錯誤）。建議：`frontend/eslint.config.mjs` 的 `globalIgnores` 補上 `playwright-report/**`（與 `.gitignore` 對齊），並由人工或下一個有權限的 task 清除本機殘留的 `frontend/playwright-report/`。
- **rule**: NONE
- **後續**: 非 reflect 候選（單純 eslint config 遺漏 + 本機殘留檔案），建議併入下一個觸碰 `frontend/eslint.config.mjs` 的 task 一併修正。

## §3 — `GET /auth/me` 未回傳 `has_pin`，設定頁只能用本機近似值判斷 PIN 設定狀態（task-021 執行中發現）

- **time**: 2026-09-07T00:35:00+08:00
- **commit**: `76b0cfd`
- **files**: `frontend/src/app/settings/page.tsx`（既存自 v1.0.0/task-002：`user_credentials.pin_hash` 存在與否從未透過任何回應欄位暴露給前端）
- **問題**: 設定頁（task-021）要依「使用者是否已設定 PIN」顯示「設定 PIN」或「變更/停用 PIN」，但 `GET /auth/me`（沿用既有 `UserResponse` schema）沒有 `has_pin` 這類欄位可供前端直接判斷。
- **根因**: task-002 設計 PIN 後端 API 時，只規劃了設定/變更/停用/登入四個 mutation endpoint，沒有把「PIN 是否已設定」這個查詢需求納入 `UserResponse`，屬於 propose-to-tasks 拆解階段的規格缺口（`design-spec.md` §12.2 沒寫到這個查詢面）。
- **修正**: 未修正（`backend/app/schemas/auth.py` 的 `UserResponse` 不在 task-021 `affected_files` 內）。worker 改用前端本機依 `user_uid` 記住的近似值（`useDeviceAccounts` 記錄「這個帳號在這台裝置上設定過 PIN」），若近似值錯誤（例如換裝置、或在其他裝置停用過 PIN），使用者點「設定 PIN」時後端回 409（PIN 已設定）會被前端捕捉並自我修正成「變更 PIN」畫面，功能上不會卡死，只是首次判斷可能顯示錯的按鈕文字。
- **rule**: NONE
- **後續**: 建議下一版在 `UserResponse` 補 `has_pin: bool` 欄位（小改動，沿用既有 `pin_hash is not None` 邏輯），屬 reflect 候選（propose-to-tasks 拆解時遺漏查詢面需求）。

## §4 — 後端無 `POST /auth/logout`，登出僅能清前端快取、httpOnly cookie 靠自然過期（既存自 v1.0.0，task-021 執行中重新暴露）

- **time**: 2026-09-07T00:35:00+08:00
- **commit**: `76b0cfd`
- **files**: `frontend/src/app/settings/page.tsx`（既存自 v1.0.0：從未有登出 API，v1.0.0 沒有登出 UI 入口，這次設定頁新增登出功能才第一次暴露）
- **問題**: 設定頁新增「登出」功能，但後端沒有 `POST /auth/logout` 可以讓 httpOnly cookie 立即失效，前端只能清空 RTK Query 快取並導向 `/login`，cookie 本身要等 TTL 到期才會真的失效——若裝置遺失，「登出」按鈕無法立即撤銷該裝置的登入態。
- **根因**: v1.0.0 propose 範圍內從未規劃登出功能（沒有登出按鈕/頁面），所以後端從未實作對應 endpoint；v1.1.0 的設定頁新增登出入口時才第一次踩到這個既存缺口。
- **修正**: 未修正（`backend/app/api/v1/auth.py` 不在 task-021 `affected_files` 內）。
- **rule**: NONE
- **後續**: 建議下一版新增 `POST /auth/logout`（清除/使 httpOnly cookie 失效，比照業界慣例可用短期 token 黑名單或直接把 cookie 設為過期），屬 reflect 候選（既存自 v1.0.0 的功能缺口，這次才被使用者可見的 UI 暴露出來）。

## §5 — `TransactionCreateRequest`/`TransactionUpdateRequest` 的 `description`/`payment_method` 為 `min_length=1`，與 `→ A5`「留白送空字串」決議矛盾，實際送出會 422（task-016 執行中發現，阻斷性）

- **time**: 2026-09-09T06:50:00+08:00
- **commit**: pending（已拆 task-028 修正）
- **files**: `backend/app/schemas/transaction.py`（既存自 v1.0.0：`TransactionCreateRequest.description`/`payment_method` 第 37/40 行、`TransactionUpdateRequest` 同名欄位第 48/51 行皆為 `Field(min_length=1, ...)`）
- **問題**: 本版核心承諾之一是「新增收支只需收支類型/日期/金額三個必填，其餘（分類/明細/支付方式）留白即可送出」，`design-spec.md` §7.1 / `→ A5` 決議「留白送出空字串」（不做後端 NULL migration）。但實際核對後端 schema，`description`/`payment_method` 皆是 `min_length=1`，空字串會被 Pydantic 直接拒絕、回 422——A5 決議的方案實際上完全無法送出成功，任何使用者留白這兩個選填欄位時新增交易都會失敗。
- **根因**: `design-spec.md` 撰寫 §7.1/`→ A5` 時，只核對過這兩個欄位在資料庫層是 `NOT NULL`（因此避免了「改 nullable」的規格建議），但沒有往下核對 Pydantic schema 層的 `min_length` 驗證規則，導致「不需要後端 migration」的結論只對了一半——DB 層確實不用動，但 API 層的驗證規則本身就阻擋了設計要求的行為，這個落差直到前端表單真正組裝完成（task-016）才被發現。
- **修正**: 未修正（`backend/app/schemas/transaction.py` 不在 task-016 `affected_files` 內）。已拆 `docs/Tasks/v1.1.0/tasks/task-028-transaction-optional-fields-schema-fix.md`（CORE-068，優先序高，修正方向：拿掉兩個 schema 四處 `min_length=1`，允許空字串，不改型別、不做 nullable）。
- **rule**: NONE
- **後續**: task-028 修正後解除；reflect 候選（`design-spec.md` 撰寫規格時對「後端不需改動」的結論，應同時核對 DB constraint 與 API schema validation 兩層，不能只查一層）。

## §6 — Dashboard 圖表（分類佔比/收支趨勢）沒有對應彙總 API，吃 `GET /transactions?limit≤100`，期間交易超過 100 筆時圖表資料不完整（task-016 執行中發現，非阻斷）

- **time**: 2026-09-09T06:50:00+08:00
- **commit**: pending
- **files**: `frontend/src/app/dashboard/page.tsx`（新增行為；後端 `backend/app/api/v1/dashboard.py` 目前只有 task-001 的 `/summary` 彙總端點，未涵蓋分類/趨勢彙總）
- **問題**: task-001 新增的 `GET /dashboard/summary` 只回傳收入/支出/結餘/預算結餘四個彙總數字，沒有「各分類金額」或「逐日/逐月趨勢」的彙總資料可供 `<CategoryPieChart>`/`<CategoryBarChart>`/`<TrendLineChart>` 使用（task-012）。task-016 組裝 Dashboard 時只能改吃既有 `GET /transactions`（`TransactionListFilter.limit` 上限 100，`→ rules`），當使用者所選期間內交易筆數超過 100 筆時，圖表只會反映最新 100 筆，不是完整期間彙總，可能誤導使用者判斷分類佔比/趨勢。
- **根因**: `design-spec.md` §12.1 規劃 Dashboard 彙總 API 時，只針對「收入/支出/結餘/預算結餘」四個純數字彙總設計端點，沒有涵蓋圖表需要的「分類明細彙總」與「時間序列彙總」這兩種聚合形狀，屬 propose-to-tasks 拆解階段對圖表資料源的規格缺口。
- **修正**: 未修正（新增彙總 API 是新功能範圍，非本版 In Scope 內任何一個 task 的 `affected_files`，不擅自擴權）。目前用既有 `/transactions` 分頁 API 頂著，功能可用但資料在高交易量期間不精確，非阻斷本版驗收（多數個人記帳情境單一期間內不易超過 100 筆）。
- **rule**: NONE
- **後續**: 建議下一版新增 `GET /dashboard/category-breakdown` 與 `GET /dashboard/trend` 兩支彙總 API（或合併成一支回傳兩種聚合形狀），屬 reflect 候選；升版判準與 `fixed.md` 收斂方式 `→ rules/00-core/11-rule-evolution.md`。

## §7 — 全套件 `uv run pytest` 合併執行才暴露：4 個既有測試檔的帳戶/分類 helper 缺必填 `color`/`icon`（task-004/005 造成）+ 1 個測試分類名稱撞上新種子分類「訂閱」（協調者收尾階段發現並修正）

- **time**: 2026-09-09T07:10:00+08:00
- **commit**: pending
- **files**: `backend/tests/api/test_recurring_rules.py`、`backend/tests/api/test_budgets.py`、`backend/tests/api/test_dashboard.py`、`backend/tests/api/test_net_worth.py`（皆為各自獨立維護的 `_create_account`/`_make_account_and_category` helper，未跟著 task-005 補 `color`/`icon`）、`backend/tests/services/test_recurring_service.py`（`_make_category` 建立名為「訂閱」的測試分類，撞上 task-004 新增的系統預設種子）、`backend/app/schemas/dashboard.py`（task-001 遺留的 E501 註解，順手一併修正）
- **問題**: 每個 task 的 worker 都只驗證自己 `affected_files` 內的測試（例如 task-028 只跑 `test_transactions.py`），個別執行皆綠燈；但用 `AGENTS.md § Build/Test/Lint` 規定的完整指令 `uv run pytest`（不帶檔案路徑，全套件跑）驗收時，才發現 17 個測試失敗 + 部分測試因級聯錯誤跳號。逐一排查後鎖定兩個根因：(1) `AccountCreateRequest`/`CategoryCreateRequest` 自 task-005/004 起 `color`/`icon` 為必填（無 default），但上述 4 個測試檔的帳戶/分類建立 helper 是各自獨立維護（未走共用 fixture），寫在這些 task 的 `affected_files` 之外，沒人被授權去補，累積成大量 422；(2) `test_recurring_service.py` 的測試分類固定命名「訂閱」，與 task-004 新增的系統預設種子分類同名，兩者在使用者建立當下的同一交易/儲存格內衝突，觸發 `uq_categories_user_uid_name` unique constraint 例外並以未捕捉的 500 等級錯誤形式擴散。
- **根因**: 拆解階段（`/propose-to-tasks`）以「檔案衝突邊界」為拆分主軸，個別 task 的 Acceptance 也只要求「該 task 相關的測試檔全綠」，沒有一個 task 的 Acceptance 涵蓋「全套件 `pytest`（不限路徑）過」這個組合驗收條件；task-004/005 改動 schema 必填欄位這種**橫向影響全部既有測試檔**的變更，在拆解當下沒有被辨識為需要額外掃描/追加受影響檔案的「破壞性變更」。
- **修正**: 4 個測試檔的帳戶/分類建立呼叫皆補上 `color`/`icon`；`test_recurring_service.py` 測試分類改名「測試訂閱服務」並註解說明避開系統種子清單原因；`dashboard.py` 註解拆成兩行符合 100 字元行寬。修正後 `uv run pytest`（全套件）從 105 passed / 17 failed / 6 errors → **122 passed / 6 errors**（剩餘 6 個 errors 皆為既有 async 連線池跨 event loop 重用問題，逐一單獨執行皆通過，非本次改動造成，已於 `tasks-v1.1.0.md` 頂部環境備註記錄為已知問題，不在本次修正範圍）。
- **rule**: NONE
- **後續**: reflect 候選：`/propose-to-tasks` 對「修改既有必填 schema 欄位」這類橫向變更，拆解時應追加「掃描全 repo 呼叫該 API 的既有測試/程式碼」步驟，而不只看新 task 自己要新增的檔案；長期建議把帳戶/分類建立的測試 helper 收斂成 `tests/factories.py` 之類的共用 fixture，避免同一段建立邏輯在多個測試檔各自維護、各自漂移。

## §8 — PIN 連續失敗鎖定機制從未真正持久化，安全承諾完全失效（task-026 e2e 執行中發現，阻斷性，已拆 task-030）

- **time**: 2026-09-09T08:00:00+08:00
- **commit**: pending（已拆 task-030 修正）
- **files**: `backend/app/services/auth_service.py`（`_verify_pin_or_raise`）、`backend/app/api/deps.py`（`get_db` 的 commit/rollback 生命週期，問題根源但不應直接改）
- **問題**: 本版對外承諾「PIN 連續輸入錯誤 5 次會鎖定 15 分鐘」（`→ propose-v1.1.0.md` 對外承諾、`design-spec.md` §12.2）。task-026 寫 e2e 時用 curl 直打 backend + psql 查表驗證，發現連錯 5 次後第 6 次仍回 401（不是預期的 429），DB 內 `pin_failed_attempts` 恆為 0，鎖定機制完全不生效。
- **根因**: `_verify_pin_or_raise` 在 PIN 錯誤時呼叫 `record_pin_failure()`（只 `flush()`）後緊接著 `raise AppError(401)`；例外往上拋到 `app/api/deps.py::get_db` 的 `except Exception: await session.rollback(); raise`，把剛才的 flush 一併回捲，失敗計數從未真正寫進資料庫。`backend/tests/api/test_auth_pin.py`（task-002）之所以顯示綠燈，是因為 `tests/conftest.py` 的 `db`/`client` fixture 用外層 transaction + rollback 做測試隔離，沒有複製正式 `get_db` 的「成功 commit / 失敗 rollback」生命週期——test double 與正式路徑分歧，造成假綠燈，這是整個 v1.1.0 過程中第一次被 e2e（走真實 HTTP 全生命週期）而非單元測試（走 test fixture）抓到的分歧案例。
- **修正**: 未修正（`auth_service.py` 不在 task-026 `affected_files` 內）。已拆 `docs/Tasks/v1.1.0/tasks/task-030-pin-lockout-persistence-fix.md`（CORE-068，優先序最高——這是安全性承諾），修正方向：`_verify_pin_or_raise` 記錄失敗/歸零計數後，在 `raise AppError` 之前明確 `await self.db.commit()`，讓側效應先落地再拋業務錯誤；不改動 `get_db` 通用例外處理（那對其他一般未預期例外的保護是對的）。
- **rule**: NONE
- **後續**: task-030 修正後解除；reflect 候選（1）「先記錄側效應、再刻意拋業務錯誤」這個模式，在 API 層規範上應該有明確寫法指引，避免下次新功能重蹈覆轍；（2）test fixture（`conftest.py` 的 `db`/`client`）與正式 `get_db` 生命週期分歧，應該有至少一條「跨 request 持久化」的合約測試守住，不能只靠 e2e 意外抓到。

## §9 — 設定 PIN 成功後從未呼叫 `rememberAccount`，PIN 快速登入入口永遠不出現（task-026 e2e 執行中發現，功能阻斷，已拆 task-031）

- **time**: 2026-09-09T08:00:00+08:00
- **commit**: pending（已拆 task-031 修正）
- **files**: `frontend/src/app/settings/page.tsx`（task-021，只解構 `forgetAccount` 未解構/呼叫 `rememberAccount`）、`frontend/src/app/login/page.tsx`（task-018，讀 `accounts` 決定要不要顯示 PIN 入口，因此永遠是空清單）
- **問題**: `useDeviceAccounts.rememberAccount`（task-014 已完成）從未被任何正式程式碼呼叫，`localStorage`（`device-accounts`）永遠是空清單，導致 `/login` 的「改用 PIN 快速登入」/ `<AccountSwitcherList>` 入口永遠不出現——使用者實際上完全走不到 PIN 登入畫面，這個版本最核心的需求之一（客製化數字鍵盤 + PIN 快速登入）在真實使用情境下不可達。task-018/task-021 各自的單元測試都通過，因為各自都是用測試 fixture 直接塞資料到 `useDeviceAccounts` 底層 `localStorage` 繞過真實流程去驗證 UI 呈現，沒有測到「設定 PIN 成功→這個帳號真的被記住」這一步的串接。
- **根因**: task-021（設定頁）與 task-014（PIN 前端串接）是同一波次（Wave 2/Wave 3）由不同 worker 平行完成，`rememberAccount` 這個 hook 方法存在，但「呼叫它」這個串接動作沒有被任何一個 task 的目標/Acceptance 明確要求，屬於拆解階段對「元件存在」與「元件被正確串接」兩者的落差。
- **修正**: 未修正（`settings/page.tsx` 不在 task-026 `affected_files` 內）。已拆 `docs/Tasks/v1.1.0/tasks/task-031-remember-device-account-wiring.md`（CORE-068，優先序高），修正方向：`settings/page.tsx` 首次設定 PIN（`POST /auth/pin`）成功後呼叫 `rememberAccount({ user_uid: me.user_uid, email: me.email })`。
- **rule**: NONE
- **後續**: task-031 修正後解除；reflect 候選（元件/hook 拆解時，若該元件的價值完全依賴「被某處呼叫」，Acceptance 應該明確包含「串接點」的驗證，不能只驗元件自身行為）。

## §10 — 2 支 v1.0.0 e2e 因 v1.1.0 改動變紅：登入導向 `/dashboard`、帳戶新增必填 `color`/`icon`（task-026 e2e 執行中發現，已拆 task-032）

- **time**: 2026-09-09T08:00:00+08:00
- **commit**: pending（已拆 task-032 修正）
- **files**: `frontend/e2e/multi-user-isolation.spec.ts`、`frontend/e2e/net-worth.spec.ts`（皆為 v1.0.0 task-018 產出，既存自 v1.0.0）
- **問題**: task-026 執行既有 e2e 全套件時，發現這兩支 v1.0.0 既有 e2e 現在會失敗：(1) 兩者皆斷言登入後導向 `/transactions`，但 task-018（登入頁重做）已把導向目標改成 `/dashboard`（對齊 v1.1.0 IA）；(2) `multi-user-isolation.spec.ts` 的 `createAccountViaApi()` 呼叫 `POST /accounts` 未帶 `color`/`icon`，撞上與 `fixed.md` §7 同一個根因（task-005 新增必填欄位）。CI 的 e2e job 目前因此必紅，與 task-026 新寫的 5 支 spec 無關。
- **根因**: 這是（既存自 v1.0.0）測試對登入導向目標的斷言，在 v1.1.0 改變該行為時沒有被同步更新，屬於「跨版本既有測試與新版本行為變更」的常見落差類型，與 §7 同一類根因（新必填欄位未同步到所有既有呼叫點）的再次出現，但這次是在 e2e 層。
- **修正**: 未修正（這兩支 e2e 不在 task-026 `affected_files` 內）。已拆 `docs/Tasks/v1.1.0/tasks/task-032-stale-e2e-specs-fix.md`（CORE-068）。
- **rule**: NONE
- **後續**: task-032 修正後解除；與 §7 同一個 reflect 候選（新增必填欄位這類橫向變更，拆解時應該掃描全 repo 含 e2e 在內的所有呼叫點，不只後端單元測試）。

## §11 — `GET /transactions` 逐筆呼叫 repository 查標籤，100 筆分頁打出最多 101 次 DB 往返（既存自 v1.0.0，使用者請求的改善優化建議掃描發現，已拆 task-033）

- **time**: 2026-09-11T16:00:00+08:00
- **commit**: pending（task-033 修正）
- **files**: `backend/app/api/v1/transactions.py`（`list_transactions()` 第 159-162 行，既存自 v1.0.0 該端點首次實作時就是這個寫法）、`backend/app/repositories/transaction_repository.py`（新增批次方法）
- **問題**: `list_transactions()` 分頁查完交易後，用 list comprehension 對每一筆交易各自呼叫一次 `repo.list_tags_for_transaction_uid(t.transaction_uid)` 撈標籤；`TransactionListFilter.limit` 上限 100，代表這個端點最多會發 1（分頁查詢）+ 1（count）+ 100（逐筆標籤）= 102 次 DB round-trip，違反 `→ BE-095`「service 禁在迴圈內呼叫 repository」。
- **根因**: `Transaction`/`Tag` 是透過 `transaction_tags` 關聯表手寫查詢，從未用 SQLAlchemy `relationship()`建模（`create_transaction`/`get_transaction`/`update_transaction` 各自單筆場景下逐筆查詢沒有 N+1 問題，容易讓人忽略 list 端點分頁後同一段程式碼會被放大到最多 100 倍），task-001（v1.0.0）實作 `GET /transactions` 時直接沿用單筆場景的 `list_tags_for_transaction_uid` 呼叫方式，沒有意識到需要為列表場景另外設計批次查詢。
- **修正**: `TransactionRepository` 新增 `list_tags_by_transaction_uids(transaction_uids)`，用單次 `transaction_tags.c.transaction_uid.in_(...)` JOIN 查詢撈整頁的標籤，回傳 `dict[UUID, list[Tag]]`；`list_transactions()` 改呼叫一次批次方法，不在迴圈內呼叫 repository。單筆場景（`get_transaction`/`create_transaction`/`update_transaction`）維持原本的 `list_tags_for_transaction_uid`（原本就只查一次，不受影響）。新增 `test_list_transactions_returns_correct_tags_per_item` 驗證批次映射不會把不同交易的標籤配錯。
- **rule**: BE-095
- **後續**: 已解除。reflect 候選：手寫關聯表（未用 SQLAlchemy `relationship()`）的多對多查詢，在新增任何「列表」端點時應該預設檢查是否需要對應的批次查詢方法，避免沿用單筆場景的寫法直接放進迴圈。

## §12 — 補上 `POST /auth/logout`，解除 §4 記錄的既存缺口（使用者請求的改善優化建議掃描發現，已拆 task-034）

- **time**: 2026-09-11T16:00:00+08:00
- **commit**: pending（task-034 修正）
- **files**: `backend/app/api/v1/auth.py`、`backend/tests/api/test_auth.py`、`frontend/src/lib/api/authApi.ts`、`frontend/src/app/settings/page.tsx`、`frontend/src/app/settings/page.test.tsx`
- **問題**: 同 §4——`backend/app/api/v1/auth.py` 從未提供 `POST /auth/logout`，設定頁「登出」只能清前端 RTK Query 快取並導向 `/login`，httpOnly `access_token` cookie 本身要等 8 小時 TTL 自然過期，裝置遺失時無法立即撤銷該裝置的登入態。
- **根因**: 見 §4（v1.0.0 propose 範圍從未規劃登出功能，後端從未實作對應 endpoint；`app/core/cookies.py::clear_jwt_cookie()` 其實早就存在，但因為沒有任何路由呼叫它，一直是死代碼）。
- **修正**: `auth.py` 新增 `POST /auth/logout`，呼叫既有的 `clear_jwt_cookie()` 清 cookie；不要求登入態（未帶 cookie 呼叫也回 200，冪等）。前端 `authApi.ts` 新增 `useLogoutMutation`，`settings/page.tsx` 的 `handleLogout` 改為先呼叫該 mutation（失敗也不擋登出流程）再清快取、導回 `/login`，移除原本說明「後端缺口」的註解。新增後端測試 `test_logout_clears_cookie_and_revokes_session`（驗證登出後 `Set-Cookie: access_token=""; Max-Age=0` 且 `/auth/me` 變 401）與 `test_logout_without_cookie_still_succeeds`；前端 `settings/page.test.tsx` 新增登出成功／登出 API 失敗兩種情境的測試。
- **rule**: NONE
- **後續**: §4 已解除，不再是開放缺口。

## §13 — `RecurringService.generate_due_transactions()` 同月內第二次呼叫（間隔數天）會重複產生交易，冪等性測試失敗（既存自 v1.1.0 task-003，使用者請求的改善優化建議掃描過程中意外發現，未修正）

- **time**: 2026-09-11T16:00:00+08:00
- **commit**: pending（未修正，交下一版）
- **files**: `backend/app/services/recurring_service.py`（`generate_due_transactions`/`list_pending_for_year_month` 疑似未正確排除同月已產生過的規則）、`backend/tests/services/test_recurring_service.py::TestGenerateDueTransactions::test_triggering_twice_in_same_month_is_idempotent`
- **問題**: 驗證 task-033/034 修正時，為了排除「全套件 pytest 既有 event-loop flake」（`tasks-v1.1.0.md` 環境備註）造成的假訊號，逐一排查全套件測試結果，發現 `test_triggering_twice_in_same_month_is_idempotent` 這個測試本身（非 flake）會穩定失敗：同一規則在同一年月被觸發 3 次（第 10、10、28 天），第三次（`third`）預期回傳空清單（冪等），實際卻多出 3 筆交易。在**完全乾淨的 main 分支**（未套用本次 task-033/034 任何改動）單獨執行同一測試也重現一樣的失敗，確認與本次改動無關，是 v1.1.0 task-003（recurring_rules 週期擴充）就存在但過去被全套件跑的 event-loop flake 蓋過、從未被單獨排查出來的真回歸。
- **根因**: 未排查（不在 task-033/034 `affected_files` 內，不擅自擴權修改 `recurring_service.py`）。初步觀察：「3 more items」意味著同一規則在第三次呼叫時被視為候選並重複產生了不只一次，懷疑 `RecurringRuleRepository.list_pending_for_year_month()` 或 `is_due()` 對「本月已產生過」的排除條件（`rule.last_generated_year_month == year_month`）有邏輯缺口，需要實際除錯才能定案，這裡只記錄現象與重現步驟。
- **修正**: 未修正。重現步驟：`docker run --rm --network <compose>_default -v "$PWD/backend:/app" -w /app --env-file .env -e UV_PROJECT_ENVIRONMENT=/tmp/venv -e UV_CACHE_DIR=/tmp/uv-cache ghcr.io/astral-sh/uv:0.9-python3.14-trixie-slim sh -c "uv sync --frozen && uv run pytest tests/services/test_recurring_service.py::TestGenerateDueTransactions::test_triggering_twice_in_same_month_is_idempotent -q"`，在乾淨 main 分支與本次 worktree 皆可重現，非本次改動造成。
- **rule**: NONE
- **後續**: 建議下一版開專門 task 除錯 `RecurringService`/`RecurringRuleRepository` 的月度冪等邏輯（固定收支重複產生交易屬於使用者可感知的資料正確性問題，優先序不低）；同時建議與既有的「全套件 pytest event-loop flake」（`tasks-v1.1.0.md` 環境備註）分開追蹤——這兩者過去被合併觀察，容易讓真回歸被誤判為環境雜訊。
