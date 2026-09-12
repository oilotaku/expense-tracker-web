---
id: task-038
title: 追蹤使用者活躍度（last_login_at），後台清單顯示最後登入時間
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/models/user.py
  - backend/alembic/versions/2026_09_11_1900-add_last_login_at_to_user_credentials.py
  - backend/app/repositories/user_repository.py
  - backend/app/repositories/admin_repository.py
  - backend/app/schemas/admin.py
  - backend/app/services/auth_service.py
  - backend/app/services/admin_service.py
  - backend/tests/api/test_admin.py
  - frontend/src/lib/api/adminApi.ts
  - frontend/src/app/admin/page.tsx
  - frontend/src/app/admin/page.test.tsx
estimated_hours: 2
rules: []
---

> 來源：使用者在後台管理頁看到「rose900325@gmail.com 的使用紀錄」後，追問「沒有其他登入紀錄?」，確認 app 完全沒有登入追蹤功能後，使用者要求補上「追蹤使用者活躍度」（CORE-068 拆補洞 task，新編號不覆寫既有 task）。

## 範圍決議

只做最小版本：`last_login_at`（只記最後一次登入時間），不做完整登入歷史表（每次登入時間/IP 都記錄）——後者複雜度高不少，以現在的規模用不到，需要異常登入偵測之類的需求出現再另開。

## 目標

- `UserCredential` 新增 `last_login_at: datetime | None`（放這裡而非 `User`，維持 PII/憑證分離，同 `must_change_password` 慣例）。
- `AuthService.login()` 與 `login_with_pin()` 驗證成功後皆呼叫 `UserRepository.record_login()` 更新時間戳；`register()` 不算登入（不設 cookie），不更新。
- `GET /admin/users` 回應新增 `last_login_at` 欄位（`AdminRepository.find_last_login_by_user_uids()` 批次查詢，同既有 account/transaction 數量的批次手法，避免 N+1）。
- `/admin` 頁面使用者清單顯示「最後登入：{時間} / 從未登入」。

## Acceptance

- [x] `uv run alembic upgrade head && downgrade -1 && upgrade head` round-trip 成功
- [x] `docker run ... uv run pytest tests/api/test_admin.py tests/api/test_auth.py -v` 全綠（20 個測試，含密碼登入/PIN 登入皆更新、註冊未登入為 null）
- [x] `uv run mypy app && uv run ruff check . && uv run ruff format --check .` 全綠
- [x] 前端 `npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全綠
- [x] `git status --porcelain` 只多出本 task 的 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/tasks/task-037-admin-panel-and-password-reset.md`（`must_change_password` 同一批次查詢/欄位放置慣例）
