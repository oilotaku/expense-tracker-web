---
id: task-015
title: 負債 Liability（後端）
status: pending
parallel: true
depends_on: [task-001]
affected_files:
  - backend/app/models/liability.py
  - backend/app/schemas/liability.py
  - backend/app/api/v1/liabilities.py
  - backend/alembic/versions/{rev}_add_liabilities.py
  - backend/tests/api/test_liabilities.py
estimated_hours: 3
rules: [rules/30-database/05-precision.md, rules/30-database/07-alembic.md]
---
## 目標

負債 CRUD：名稱、金額、可選利率。不做還款排程（propose Out of Scope 之外的明確排除項）。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_liabilities.py` 全綠
- [ ] alembic upgrade/downgrade round-trip OK
- [ ] 金額欄位為 Numeric

## 必讀檔（Just-in-time）

- rules/30-database/05-precision.md
- rules/30-database/07-alembic.md
