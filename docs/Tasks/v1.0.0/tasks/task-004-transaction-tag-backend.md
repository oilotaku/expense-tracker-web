---
id: task-004
title: 交易 Transaction + 標籤 Tag（後端）
status: done
parallel: false
depends_on: [task-001, task-002, task-003]
affected_files:
  - backend/app/models/transaction.py
  - backend/app/models/tag.py
  - backend/app/schemas/transaction.py
  - backend/app/api/v1/transactions.py
  - backend/app/repositories/transaction_repository.py
  - backend/alembic/versions/{rev}_add_transactions_and_tags.py
  - backend/tests/api/test_transactions.py
estimated_hours: 6
rules: [rules/20-backend/01-routing.md, rules/30-database/05-precision.md, rules/30-database/07-alembic.md, rules/00-core/03-timezone.md]
---
## 目標

交易 CRUD：日期、分類（FK task-003）、明細、金額、收支類型（收入/支出）、支付方式、帳戶（FK task-002）。每筆交易可掛多個使用者自訂標籤（多對多關聯表，標籤與分類是分開欄位）。金額用資料庫 Numeric 型別儲存（禁 float，→ rules/30-database/05-precision.md）。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_transactions.py` 全綠，含：建立交易並掛 2 個標籤、依分類篩選、依日期區間篩選
- [ ] alembic upgrade/downgrade round-trip OK
- [ ] 金額欄位為 Numeric（`\d transactions` 或 SQLAlchemy 型別斷言確認，非 float/double）
- [ ] 日期時間欄位為 `TIMESTAMPTZ`，API 回傳依 `Settings.API_TZ` 轉換（→ rules/00-core/03-timezone.md）

## 必讀檔（Just-in-time）

- rules/20-backend/01-routing.md
- rules/30-database/05-precision.md
- rules/30-database/07-alembic.md
- rules/00-core/03-timezone.md
