---
id: task-007
title: 週期性交易（後端，含月底夾日）
status: pending
parallel: false
depends_on: [task-004]
affected_files:
  - backend/app/models/recurring_rule.py
  - backend/app/schemas/recurring_rule.py
  - backend/app/api/v1/recurring_rules.py
  - backend/app/services/recurring_service.py
  - backend/alembic/versions/{rev}_add_recurring_rules.py
  - backend/tests/services/test_recurring_service.py
estimated_hours: 5
rules: [rules/00-core/03-timezone.md, rules/20-backend/03-async-and-tx.md, rules/30-database/07-alembic.md]
---
## 目標

使用者可設定每月固定收入 / 支出規則（分類、金額、每月第幾天）。到期時（服務啟動或每日檢查）對到期規則產生當月一筆交易（task-004 的 transactions 表）。設定日超過當月天數（如 31 號）時自動夾到當月最後一天（propose 決議，非阻塞待辦）。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/services/test_recurring_service.py` 全綠，**必含**「規則設定 31 號、於 2 月執行時產生在 28 或 29 號（依當年是否閏年）」案例
- [ ] 同一規則同一月份重複觸發不會產生兩筆交易（冪等）
- [ ] alembic upgrade/downgrade round-trip OK

## 必讀檔（Just-in-time）

- rules/00-core/03-timezone.md
- rules/20-backend/03-async-and-tx.md
- rules/30-database/07-alembic.md
