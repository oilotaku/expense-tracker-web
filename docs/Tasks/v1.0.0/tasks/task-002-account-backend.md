---
id: task-002
title: 帳戶 Account（後端）
status: done
parallel: true
depends_on: [task-001]
affected_files:
  - backend/app/models/account.py
  - backend/app/schemas/account.py
  - backend/app/api/v1/accounts.py
  - backend/app/repositories/account_repository.py
  - backend/alembic/versions/{rev}_add_accounts.py
  - backend/tests/api/test_accounts.py
estimated_hours: 3
rules: [rules/20-backend/01-routing.md, rules/20-backend/02-auth.md, rules/30-database/01-identifiers.md, rules/30-database/07-alembic.md]
---
## 目標

使用者可管理現金 / 銀行帳戶清單（名稱、餘額），供交易的「帳戶」欄位與 task-016 淨資產彙總引用。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_accounts.py` 全綠
- [ ] alembic upgrade/downgrade round-trip OK
- [ ] 未帶 JWT 呼叫 `/api/v1/accounts` 回 401
- [ ] 帳戶只能被建立者本人的 API 呼叫看到（另一使用者查詢回空清單，不是 403 洩漏存在性）

## 必讀檔（Just-in-time）

- rules/20-backend/01-routing.md
- rules/20-backend/02-auth.md
- rules/30-database/01-identifiers.md
- rules/30-database/07-alembic.md
