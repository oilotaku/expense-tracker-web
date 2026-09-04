---
id: task-005
title: 帳戶 Account 後端擴充（顏色/圖示）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/models/account.py
  - backend/alembic/versions/{rev}_add_color_icon_to_accounts.py
  - backend/app/schemas/account.py
  - backend/app/api/v1/accounts.py
  - backend/app/repositories/account_repository.py
  - backend/tests/api/test_accounts.py
estimated_hours: 3
rules: [rules/30-database/07-alembic.md, rules/20-backend/01-routing.md]
---
## 目標

`design-spec.md` §12.4：`Account` 新增 `color`（`String(7)` not null，`^#[0-9A-Fa-f]{6}$`）與 `icon`（`String(50)` not null）欄位，做法與 task-004 的 Category 對稱；migration 對既有帳戶（含新使用者註冊時的預設「現金」「銀行」兩帳戶）做資料回填。`AccountRepository` 的建立/更新方法擴充接受 `color`/`icon`；`accounts.py` router 的 create/update endpoint 傳入新欄位；`AccountCreateRequest`/`AccountUpdateRequest`/`AccountResponse` 對應調整。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_accounts.py` 全綠，含：建立帳戶帶 `color`/`icon`、`color` 格式錯誤回 422、更新帳戶的 `color`/`icon`、既有帳戶升級後 `color`/`icon` 有合法初始值（非空、符合格式）
- [ ] alembic `upgrade head` / `downgrade -1` round-trip OK
- [ ] `docker compose exec backend uv run mypy app` 全綠

## 必讀檔（Just-in-time）

- rules/30-database/07-alembic.md
- rules/20-backend/01-routing.md
