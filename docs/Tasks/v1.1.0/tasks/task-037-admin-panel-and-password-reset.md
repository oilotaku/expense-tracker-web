---
id: task-037
title: 後台管理（查/刪使用者、重設密碼）+ 自助改密碼 + 強制改密碼流程
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/core/config.py
  - backend/app/models/user.py
  - backend/alembic/versions/2026_09_11_1830-add_must_change_password_to_user_credentials.py
  - backend/app/repositories/user_repository.py
  - backend/app/repositories/admin_repository.py
  - backend/app/schemas/auth.py
  - backend/app/schemas/admin.py
  - backend/app/services/auth_service.py
  - backend/app/services/admin_service.py
  - backend/app/api/deps.py
  - backend/app/api/v1/auth.py
  - backend/app/api/v1/admin.py
  - backend/app/api/v1/__init__.py
  - backend/tests/api/test_auth.py
  - backend/tests/api/test_admin.py
  - frontend/src/lib/api/authApi.ts
  - frontend/src/lib/api/adminApi.ts
  - frontend/src/components/AuthGuard.tsx
  - frontend/src/components/AuthGuard.test.tsx
  - frontend/src/app/change-password/page.tsx
  - frontend/src/app/change-password/page.test.tsx
  - frontend/src/app/admin/page.tsx
  - frontend/src/app/admin/page.test.tsx
  - .env.development.example
  - .env.production.example
  - .env.staging.example
estimated_hours: 8
rules: [BE-023, DB-033, CORE-111]
---

> 來源：使用者「商業化這類應用還缺什麼」討論後，選定優先補「後台管理」＋「忘記密碼的替代方案（admin 手動重設密碼）」，逐步敲定範圍後直接授權實作（CORE-068 拆補洞 task，新編號不覆寫既有 task）。

## 範圍決議（對話中逐項敲定，未經使用者同意不擴權）

- **admin 身份判定**：不開 `is_admin` 欄位/角色系統（單人維運場景），改用環境變數 `ADMIN_EMAILS`（email 完全比對），省掉「誰來授予第一個 admin」的問題。
- **admin 能做什麼**：只做「查使用者清單（含帳戶/交易數量，不含明細內容）」「刪除使用者（軟刪）」「重設使用者密碼」，刻意不做「直接編輯使用者財務資料」——責任歸屬不清，真要修資料回去用 psql（同今天稍早手動清 e2e 殘留帳號的方式）。
- **重設密碼設計**：選「方案 B」——後端產生隨機臨時密碼回傳給 admin（不讓 admin 自己輸入密碼），同時標記該使用者 `must_change_password=true`，下次登入（含 PIN 登入）強制先改密碼才能使用其他頁面。
- **放哪裡**：掛在同一個 Next.js app 的 `/admin` 路由 + 同一組 FastAPI 的 `/api/v1/admin/*`，不另開 app/deploy 單位。
- **稽核**：admin 刪除/重設密碼都寫進既有的結構化 log（`logger.warning`，含 admin email + 目標 user_uid，不含明文密碼，→ CORE-111）。

## 目標

1. **`ADMIN_EMAILS` + `require_admin`**：`Settings.ADMIN_EMAILS: list[str]`（同 `CORS_ORIGINS` 的 list 解析慣例）；`app/api/deps.py::require_admin` 依賴比對 `current_user.email`，不在名單內回 403。
2. **`must_change_password`**：`UserCredential` 新欄位（不放 `User`，維持 PII 與憑證分離，→ DB-027）；migration 冪等（`if_not_exists`）、downgrade 為 no-op（→ DB-033）。
3. **自助改密碼**：`PATCH /auth/change-password`（`current_password` + `new_password`），成功後清除 `must_change_password`；`UserResponse` 新增 `is_admin`/`must_change_password` 兩個欄位（`_to_user_response` 統一計算，`login`/`login_with_pin`/`get_me` 皆共用，PIN 登入天然一起被強制攔截，不需額外特判）。
4. **後台管理 API**：`GET /admin/users`（分頁、批次 GROUP BY 撈帳戶/交易數，避免逐使用者查詢造成 N+1，同今天修過的手法）、`DELETE /admin/users/{uid}`（軟刪 User+UserCredential，不能刪自己，比照全站既有慣例不做硬刪連動子表）、`POST /admin/users/{uid}/reset-password`（`secrets.token_urlsafe` 產生臨時密碼）。
5. **前端**：`/admin` 頁（清單 + 刪除 ConfirmDialog + 重設密碼結果 Dialog，`me.is_admin` 只做 UX 顯示，真正授權靠後端 403）；`/change-password` 頁（強制改密碼表單）；`<AuthGuard>` 偵測 `must_change_password` 導向 `/change-password`（排除自己避免無限迴圈）。

## Acceptance

- [x] `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head` round-trip 成功
- [x] `docker run ... uv run pytest tests/api/test_admin.py tests/api/test_auth.py -v` 全綠（18 個測試，含權限 403、清單數量、刪除軟刪擋登入、重設密碼強制改密碼全流程、自助改密碼密碼錯誤 401）
- [x] `uv run mypy app && uv run ruff check . && uv run ruff format --check .` 全綠
- [x] 前端 `npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全綠（342 個測試，含 `/admin`、`/change-password`、`AuthGuard` 新增案例）
- [x] `git status --porcelain` 只多出本 task 的 `affected_files`

## 未做（明確排除，非遺漏）

- 忘記密碼的自助 email 流程（需要寄信基礎設施，另案追蹤，見 assistant 記憶 `project_forgot_password_planned`）——admin 手動重設密碼是現階段的替代方案。
- AppShell/Sidebar 導覽列沒有加「管理後台」連結（避免動到共用元件與其大量既有測試），admin 目前靠直接打 `/admin` 網址進入。
- admin 直接編輯使用者財務資料——刻意排除，見上方範圍決議。

## 必讀檔（Just-in-time）

- `backend/app/repositories/account_repository.py::soft_delete`（軟刪既有慣例）
- `docs/Tasks/v1.1.0/fixed.md` §11（今天稍早修的 N+1 查詢手法，本 task 的使用者清單計數沿用同一批次查詢寫法）
