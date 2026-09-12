# Tasks v1.1.0 — expense-tracker-web

> 狀態：待批准（0/26）　盲點掃描：無實質缺口（`design-spec.md` §13 兩個開放問題已於 2026-09-04 決議完畢，內容併入 §1/§5/§12，propose 六區塊齊全）。以下邊界情況依既有規則慣例逕行決定並寫入對應 task 的 Acceptance / 目標，不影響 scope、不需使用者另行決議：
> - PIN 登入對「`user_uid` 不存在」與「該使用者未設定 PIN」統一回同一句通用 401 訊息，避免帳號列舉（比照 `AuthService.login()` 現有 `_LOGIN_FAILED_DETAIL` 慣例）→ task-002。
> - `recurring_rules.interval_unit=year` 且 `anchor_date` 為 2/29、目標年非閏年時，比照既有「超過當月天數夾到月底」規則夾到 2/28 → task-003。
> - `GET /dashboard/summary` 的 `(user_uid, transaction_date)` 查詢效能沿用既有索引慣例（`→ rules/30-database/08-indexes-and-perf.md`），若既有索引不足由 worker 於 task-001 一併補（`affected_files` 已含 migration 空間，不需新開 task）。

- **狀態**：**全部完成**（26/26 原始範圍 done + 13 個補洞 task 027/028/029/030/031/032/033/034/035/036/037/038/039 皆 done，共 39 個 task）。另有 1 項不掛 task 編號的直接修正：`frontend/src/app/page.tsx` 根路由導向修正（使用者實測發現，commit `f675a69`）。task-033/034/035/036/037/038/039 為使用者請求的「專案改善優化建議」掃描與後續需求後直接授權修的補洞 task（非 task-016/021 執行中發現，來源見各 task 檔）。
- **重要環境修復記錄**：`docker compose watch` 在多次 session 中斷過程中掛掉，backend/frontend 容器一度停留在舊版程式碼（frontend 停在 9/4 最早版本），已於 2026-09-09 重新 `docker compose up -d --build` 兩個服務並重啟 `watch`；同時第一次真正跑全套件 `uv run pytest`（過去只各自驗 task 相關檔案）抓到 §7 兩個真 bug 並修正，全套件 105→122 passed。task-026 e2e 前置條件已備妥，容器狀態可信。
- **環境備註**：
  - `frontend` container 是 production standalone image（無 devDependencies/`tsc`），跑 vitest/typecheck/lint 驗證要用 `docker run node:24-alpine` 掛載 `frontend/node_modules`，不能直接 `docker compose exec frontend`；host 直接跑 vitest 有 rolldown native binding 問題，同樣不可行（task-007 已驗證，後續 wave 的 worker 可省去重新摸索）。
  - `tests/services/test_recurring_service.py` 等既有 async 測試在**整批**跑（非單獨跑）時，teardown 階段偶發 `RuntimeError: Event loop is closed`（`conftest.py` engine/pool 跨 event loop 重用的既有環境瑕疵，task-003 已確認與本版改動無關，任一單獨執行皆通過）。後續 worker 若整批跑到類似錯誤，先確認是否單獨跑會過，過就不是你要修的問題，記到 `fixed.md` 交給後續版本处理，不要在自己 task 範圍內硬修 `conftest.py`。
  - 本機是資源有限的 Raspberry Pi（4 核/8GB），worker 平行度上限抓 2 個，避免同時跑多個 docker build/pytest 把 session process 壓垮中斷。
- **來源**：`propose-v1.1.0.md`
- **更新**：2026-09-04
- **格式定義**：`HARNESS_HOME/rules/00-core/10-propose-tasks-fixed.md`

> **重要**：使用者已批准派工（`→ SKILL.md` 步驟 9），依依賴關係分波次進行中。Wave 1（001/002/003/004/005/006/007）派工中。

## 任務清單

| # | 標題 | 狀態 | 並行 | 依賴 | 影響檔案 | worker |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | Dashboard 期間彙總 API（後端） | done | ✓ | — | `backend/app/api/v1/dashboard.py`、`backend/app/api/v1/__init__.py`、`backend/app/schemas/dashboard.py`、`backend/app/services/dashboard_service.py`、`backend/tests/api/test_dashboard.py` | a77df401（commit `6fb3dec`） |
| 002 | PIN 登入後端支援 | done | ✓ | — | `backend/app/models/user.py`、`backend/alembic/versions/{rev}_add_pin_to_user_credentials.py`、`backend/app/schemas/auth.py`、`backend/app/api/v1/auth.py`、`backend/app/services/auth_service.py`、`backend/app/repositories/user_repository.py`、`backend/tests/api/test_auth_pin.py` | a9d7992b（commit `32dd7b7`） |
| 003 | recurring_rules 週期擴充（後端） | done | ✓ | — | `backend/app/models/recurring_rule.py`、`backend/alembic/versions/{rev}_add_interval_to_recurring_rules.py`、`backend/app/schemas/recurring_rule.py`、`backend/app/api/v1/recurring_rules.py`、`backend/app/services/recurring_service.py`、`backend/app/repositories/recurring_rule_repository.py`、`backend/tests/services/test_recurring_service.py`、`backend/tests/api/test_recurring_rules.py` | a9d7992b（commit `2797bc8`） |
| 004 | 分類 Category 後端擴充（顏色/圖示 + 訂閱種子） | done | ✓ | — | `backend/app/models/category.py`、`backend/alembic/versions/{rev}_add_color_icon_to_categories.py`、`backend/alembic/versions/{rev}_add_subscription_category.py`、`backend/app/schemas/category.py`、`backend/app/api/v1/categories.py`、`backend/app/repositories/category_repository.py`、`backend/tests/api/test_categories.py` | a9d7992b（commit `0532db4`） |
| 005 | 帳戶 Account 後端擴充（顏色/圖示） | done | ✓ | — | `backend/app/models/account.py`、`backend/alembic/versions/{rev}_add_color_icon_to_accounts.py`、`backend/app/schemas/account.py`、`backend/app/api/v1/accounts.py`、`backend/app/repositories/account_repository.py`、`backend/tests/api/test_accounts.py` | a9d7992b（commit `764ba54`） |
| 006 | 前端新增依賴套件安裝與版本鎖定 | done | ✓ | — | `frontend/package.json`、`frontend/package-lock.json` | aa7638ce（commit `902c67b`） |
| 007 | 視覺設計系統 tokens + Dark Mode 基礎機制 | done | ✓ | — | `frontend/src/app/globals.css`、`frontend/src/app/layout.tsx`、`frontend/src/hooks/useReducedMotion.ts`、`frontend/src/hooks/useReducedMotion.test.ts`、`frontend/src/hooks/useThemePreference.ts`、`frontend/src/hooks/useThemePreference.test.ts` | aa5ab547（commit `e4fffb2`） |
| 008 | 共用 Overlay 元件（Dialog / ConfirmDialog / Toaster） | done | ✓ | task-006 | `frontend/src/components/common/Dialog.tsx`、`frontend/src/components/common/Dialog.test.tsx`、`frontend/src/components/common/ConfirmDialog.tsx`、`frontend/src/components/common/ConfirmDialog.test.tsx`、`frontend/src/components/common/Toaster.tsx`、`frontend/src/components/common/Toaster.test.tsx`、`frontend/src/hooks/useToast.ts`、`frontend/src/hooks/useToast.test.ts` | a741075f（commit `1a8e451`） |
| 009 | AppShell 導覽元件（Sidebar / BottomNav / CurvedCard / WaveDivider / ThemeToggle） | done | ✓ | task-006, task-007 | `frontend/src/components/common/AppShell.tsx`、`frontend/src/components/common/AppShell.test.tsx`、`frontend/src/components/common/Sidebar.tsx`、`frontend/src/components/common/BottomNav.tsx`、`frontend/src/components/common/CurvedCard.tsx`、`frontend/src/components/common/WaveDivider.tsx`、`frontend/src/components/common/ThemeToggle.tsx`、`frontend/src/hooks/useBreakpoint.ts`、`frontend/src/hooks/useBreakpoint.test.ts` | a2851509（commit `0f8eb19`） |
| 010 | 客製化數字鍵盤 NumericKeypad（含 PIN autofill 支援） | done | ✓ | task-006, task-007 | `frontend/src/components/common/NumericKeypad.tsx`、`frontend/src/components/common/NumericKeypad.test.tsx` | a46fa35d（commit `7048200`） |
| 011 | 色票 / 圖示選擇器 | done | ✓ | task-007 | `frontend/src/components/common/ColorSwatchPicker.tsx`、`frontend/src/components/common/ColorSwatchPicker.test.tsx`、`frontend/src/components/common/IconPicker.tsx`、`frontend/src/components/common/IconPicker.test.tsx` | aaa95d3c（commit `7015bbf`） |
| 012 | Dashboard 圖表元件 | done | ✓ | task-006, task-007 | `frontend/src/components/dashboard/ChartTypeSwitcher.tsx`、`frontend/src/components/dashboard/ChartTypeSwitcher.test.tsx`、`frontend/src/components/dashboard/CategoryPieChart.tsx`、`frontend/src/components/dashboard/CategoryBarChart.tsx`、`frontend/src/components/dashboard/TrendLineChart.tsx`、`frontend/src/hooks/useChartPreference.ts`、`frontend/src/hooks/useChartPreference.test.ts` | aaa2bc2a（commit `924f3f6`） |
| 013 | Dashboard 彙總 API 前端串接 | done | ✓ | task-001, task-027 | `frontend/src/lib/api/dashboardApi.ts`、`frontend/src/lib/api/dashboardApi.test.ts` | a4c05249（commit `273550e`+`c29946c`） |
| 014 | PIN 前端串接（authApi + useDeviceAccounts） | done | ✓ | task-002 | `frontend/src/lib/api/authApi.ts`、`frontend/src/hooks/useDeviceAccounts.ts`、`frontend/src/hooks/useDeviceAccounts.test.ts` | a4d830af（commit `875d0f9`） |
| 015 | 新增/編輯交易表單（TransactionFormDialog + RecurringFieldset） | done | ✓ | task-006, task-008, task-010, task-003 | `frontend/src/components/transactions/TransactionFormDialog.tsx`、`frontend/src/components/transactions/TransactionFormDialog.test.tsx`、`frontend/src/components/transactions/RecurringFieldset.tsx`、`frontend/src/components/transactions/RecurringFieldset.test.tsx` | a0c7b548（commit `76062f8`） |
| 016 | Dashboard 頁面重做（桌機 + 行動版） | done（發現 3 個跨 task 缺口，見 fixed.md §3/§4/§5，其中 §5 為阻斷性已拆 task-028） | ✓ | task-007, task-008, task-009, task-012, task-013, task-015 | `frontend/src/app/dashboard/page.tsx`、`frontend/src/app/dashboard/page.test.tsx`、`frontend/src/components/dashboard/PeriodSelector.tsx`、`frontend/src/components/dashboard/PeriodSelector.test.tsx`、`frontend/src/components/dashboard/StatTile.tsx`、`frontend/src/components/dashboard/StatTile.test.tsx`、`frontend/src/components/dashboard/NetWorthCard.tsx`、`frontend/src/components/dashboard/NetWorthCard.test.tsx` | ad871bb0（commit `8621e9b`） |
| 028 | 補洞：TransactionCreateRequest description/payment_method 允許空字串（CORE-068，阻斷性，來源 task-016） | done | ✓ | — | `backend/app/schemas/transaction.py`、`backend/tests/api/test_transactions.py` | a2a2cc3f（commit `3d1bd6f`） |
| 029 | 補洞：全套件 pytest 合併執行才暴露的 4 個測試檔缺 color/icon + 1 個測試分類名撞新種子（CORE-068，協調者收尾發現並修正） | done | — | — | `backend/tests/api/test_recurring_rules.py`、`backend/tests/api/test_budgets.py`、`backend/tests/api/test_dashboard.py`、`backend/tests/api/test_net_worth.py`、`backend/tests/services/test_recurring_service.py`、`backend/app/schemas/dashboard.py`、`backend/app/services/auth_service.py`（format only） | 協調者（commit `870d038`） |
| 017 | 交易清單頁重做（含移除舊 TransactionForm，CORE-068 從 task-015 移交） | done（已知偏離：update/delete mutation 因 transactionsApi.ts 不在 scope 內改用 injectEndpoints 掛在 TransactionList.tsx，建議後續遷回集中管理） | ✓ | task-008, task-015 | `frontend/src/app/transactions/page.tsx`、`frontend/src/app/transactions/page.test.tsx`、`frontend/src/components/TransactionList.tsx`、`frontend/src/components/TransactionList.test.tsx`、`frontend/src/components/TransactionForm.tsx`（移除）、`frontend/src/components/TransactionForm.test.tsx`（移除） | a87ae88b（commit `6b145a9`） |
| 018 | 登入頁重做（PIN + 密碼雙模式） | done | ✓ | task-007, task-008, task-010, task-014 | `frontend/src/app/login/page.tsx`、`frontend/src/app/login/page.test.tsx`、`frontend/src/components/auth/PinLoginPad.tsx`、`frontend/src/components/auth/PinLoginPad.test.tsx`、`frontend/src/components/auth/AccountSwitcherList.tsx`、`frontend/src/components/auth/AccountSwitcherList.test.tsx` | afad4b6b（commit `f282fcf`） |
| 019 | 分類管理頁（新頁） | done（已知取捨：`CategoryChip.tsx` 複製了一份圖示定義而非 import `IconPicker.tsx` 的 export，未來整併見 reflect 候選） | ✓ | task-007, task-008, task-011, task-004 | `frontend/src/app/categories/page.tsx`、`frontend/src/app/categories/page.test.tsx`、`frontend/src/components/categories/CategoryChip.tsx`、`frontend/src/components/categories/CategoryChip.test.tsx`、`frontend/src/lib/api/categoriesApi.ts`、`frontend/src/lib/api/categoriesApi.test.ts` | a71b66e2（commit `1a72f00`） |
| 020 | 帳戶管理頁（新頁） | done | ✓ | task-007, task-008, task-011, task-005 | `frontend/src/app/accounts/page.tsx`、`frontend/src/app/accounts/page.test.tsx`、`frontend/src/components/accounts/AccountCard.tsx`、`frontend/src/components/accounts/AccountCard.test.tsx`、`frontend/src/lib/api/accountsApi.ts`、`frontend/src/lib/api/accountsApi.test.ts` | a890783c（commit `98514f3`） |
| 021 | 設定頁（新頁） | done（2 個已知缺口記 fixed.md §3/§4，非阻塞） | ✓ | task-007, task-008, task-010, task-014 | `frontend/src/app/settings/page.tsx`、`frontend/src/app/settings/page.test.tsx` | ade5af14（commit `76b0cfd`） |
| 022 | 週期性交易頁視覺重做 + 週/年前端串接 | done | ✓ | task-009, task-003 | `frontend/src/app/recurring/page.tsx`、`frontend/src/app/recurring/page.test.tsx`、`frontend/src/lib/api/recurringApi.ts` | ae70e1b0（commit `9af38fb`） |
| 023 | 預算頁視覺重做 | done | ✓ | task-009 | `frontend/src/app/budgets/page.tsx`、`frontend/src/app/budgets/page.test.tsx` | a3328b18（commit `467657d`） |
| 024 | 資產頁視覺重做 | done | ✓ | task-009 | `frontend/src/app/assets/page.tsx`、`frontend/src/app/assets/page.test.tsx` | a7d381fa（commit `556d629`） |
| 025 | 註冊頁視覺重做 | done | ✓ | task-007, task-009 | `frontend/src/app/register/page.tsx`、`frontend/src/app/register/page.test.tsx` | a3bd719c（commit `22ad8f3`） |
| 026 | e2e：PIN 登入 / Dashboard 彙總 / 週期擴充 / 分類帳戶顏色 / Dark Mode | done（發現 3 個阻斷性缺口，已拆 task-030/031/032） | — | task-016, task-018, task-019, task-020, task-021, task-022 | `frontend/e2e/pin-login.spec.ts`、`frontend/e2e/dashboard-summary.spec.ts`、`frontend/e2e/recurring-interval.spec.ts`、`frontend/e2e/category-account-color.spec.ts`、`frontend/e2e/dark-mode.spec.ts` | a2fa2866（commit `4e674e0`） |
| 030 | 補洞：PIN 鎖定計數器從未真正持久化（CORE-068，安全性阻斷，來源 task-026） | done（已用反向驗證確認修正真的必要，非假綠燈） | ✓ | — | `backend/app/services/auth_service.py`、`backend/tests/api/test_auth_pin.py` | ac49a21d（commit `145a963`） |
| 031 | 補洞：設定 PIN 成功後從未呼叫 rememberAccount，PIN 快速登入入口不會出現（CORE-068，功能阻斷，來源 task-026） | done | ✓ | — | `frontend/src/app/settings/page.tsx`、`frontend/src/app/settings/page.test.tsx` | af13cbc5（commit `52dd193`） |
| 032 | 補洞：修正 2 支 v1.0.0 e2e 因登入導向 /dashboard + 帳戶必填 color/icon 而變紅（CORE-068，來源 task-026） | done（另修正 2 個任務書未列的既有斷點：task-017 表單改 Dialog、task-016 總資產 DOM 改變；net-worth 等台股開盤後 09:05 重跑轉綠） | ✓ | — | `frontend/e2e/multi-user-isolation.spec.ts`、`frontend/e2e/net-worth.spec.ts` | a035c80f（commit `f92cecd`） |
| 027 | 補洞：msw devDependency + eslint 掃描範圍（CORE-068，來源 `fixed.md` §1/§2） | done | ✓ | task-006 | `frontend/package.json`、`frontend/package-lock.json`、`frontend/eslint.config.mjs` | a1a18235（commit `a27b584`） |
| 033 | 補洞：交易清單 N+1 查詢修正（批次撈標籤，CORE-068，來源：使用者請求的改善優化建議掃描） | done | ✓ | — | `backend/app/api/v1/transactions.py`、`backend/app/repositories/transaction_repository.py`、`backend/tests/api/test_transactions.py` | claude（本次 session，`.claude/worktrees/n1-logout-fixes`） |
| 034 | 補洞：補上 POST /auth/logout，解除 fixed.md §4（CORE-068，來源：使用者請求的改善優化建議掃描） | done | ✓ | — | `backend/app/api/v1/auth.py`、`backend/tests/api/test_auth.py`、`frontend/src/lib/api/authApi.ts`、`frontend/src/app/settings/page.tsx`、`frontend/src/app/settings/page.test.tsx` | claude（本次 session，`.claude/worktrees/n1-logout-fixes`） |
| 035 | 補洞：固定收支 description/payment_method 允許空字串，同步 task-028（CORE-068，來源：使用者請求） | done | ✓ | — | `backend/app/schemas/recurring_rule.py`、`backend/tests/api/test_recurring_rules.py` | claude（本次 session，`.claude/worktrees/n1-logout-fixes`） |
| 036 | 補洞：帳戶編輯畫面新增直接編輯餘額功能（CORE-068，來源：使用者請求） | done | ✓ | — | `frontend/src/components/accounts/AccountCard.tsx`、`frontend/src/components/accounts/AccountCard.test.tsx`、`frontend/src/app/accounts/page.tsx`、`frontend/src/app/accounts/page.test.tsx` | claude（本次 session，`.claude/worktrees/n1-logout-fixes`） |
| 037 | 補洞：後台管理（查/刪使用者、重設密碼）+ 強制改密碼流程（CORE-068，來源：使用者討論後授權） | done | ✓ | — | 見 `tasks/task-037-admin-panel-and-password-reset.md` frontmatter（23 個 affected_files，橫跨後端 admin/auth 與前端 admin/change-password/AuthGuard） | claude（本次 session，`.claude/worktrees/n1-logout-fixes`） |
| 038 | 補洞：追蹤使用者活躍度（last_login_at），後台清單顯示最後登入（CORE-068，來源：使用者討論後授權） | done | ✓ | task-037 | `backend/app/models/user.py`、`backend/app/repositories/user_repository.py`、`backend/app/repositories/admin_repository.py`、`backend/app/schemas/admin.py`、`backend/app/services/auth_service.py`、`backend/app/services/admin_service.py`、`backend/tests/api/test_admin.py`、`frontend/src/lib/api/adminApi.ts`、`frontend/src/app/admin/page.tsx`、`frontend/src/app/admin/page.test.tsx` | claude（本次 session，`.claude/worktrees/n1-logout-fixes`） |
| 039 | 補洞：預算頁新增編輯上限金額與刪除功能（CORE-068，來源：使用者請求） | done | ✓ | — | `frontend/src/lib/api/budgetsApi.ts`、`frontend/src/app/budgets/page.tsx`、`frontend/src/app/budgets/page.test.tsx` | claude（本次 session，`.claude/worktrees/n1-logout-fixes`） |

## 跨 area 三段鏈（後端 API → 前端串接 → 頁面/e2e）

- **Dashboard 彙總**：task-001（後端）→ task-013（前端串接）→ task-016（頁面）→ task-026（e2e）
- **PIN 登入**：task-002（後端）→ task-014（前端串接）→ task-018（登入頁）/ task-021（設定頁）→ task-026（e2e）
- **週期性交易擴充**：task-003（後端）→ task-015（表單元件）/ task-022（頁面）→ task-026（e2e）
- **分類顏色/圖示 + 訂閱種子**：task-004（後端）→ task-019（頁面）→ task-026（e2e）
- **帳戶顏色/圖示**：task-005（後端）→ task-020（頁面）→ task-026（e2e）

## In Scope 對應（無 orphan 檢查）

| propose In Scope 條目 | 對應 task |
| --- | --- |
| 視覺設計系統（tokens/圓角/陰影/字級/間距/字體 + Dark Mode 切換） | 006, 007, 009 |
| IA 重新梳理 + 帳戶管理/分類管理/設定三新頁 | 019, 020, 021 |
| 桌面 + 行動版面規劃（RWD） | 009, 016–025（各頁 Acceptance 含 RWD 檢查） |
| 密碼/PIN 登入 + 客製化數字鍵盤 + PIN 後端 | 002, 010, 014, 018 |
| 帳戶漸進揭露 | 016, 020 |
| Dashboard（期間彙總/圖表/帳戶總覽）+ 彙總 API | 001, 012, 013, 016 |
| 交易清單編輯/刪除 | 017 |
| 新增收支（必填精簡 + 固定收支週期含週/月/年） | 003, 015 |
| 分類管理頁（含新增「訂閱」） | 004, 019 |
| 分類/帳戶顏色與圖示欄位 | 004, 005, 011, 019, 020 |
| 流暢曲線動畫（`prefers-reduced-motion`） | 007, 009, 012, 015（各自 Acceptance 含 reduced-motion 檢查） |
| 週期性交易/預算/資產視覺重做（沿用既有 API） | 022, 023, 024 |
| 註冊頁視覺重做 | 025 |

無 orphan：propose `In Scope` 每條目皆有對應 task。
