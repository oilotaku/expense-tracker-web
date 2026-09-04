---
id: task-009
title: 預算 Budget（後端）
status: done
parallel: false
depends_on: [task-003, task-004]
affected_files:
  - backend/app/models/budget.py
  - backend/app/schemas/budget.py
  - backend/app/api/v1/budgets.py
  - backend/app/services/budget_service.py
  - backend/alembic/versions/{rev}_add_budgets.py
  - backend/tests/api/test_budgets.py
estimated_hours: 4
rules: [rules/20-backend/08-performance.md, rules/30-database/07-alembic.md, rules/00-core/03-timezone.md]
---
## 目標

使用者可依分類設定當月或當日預算上限。提供已花費彙總 API：依 task-004 的交易表即時加總同分類、同期間（當月或當日）的支出，與上限比較。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_budgets.py` 全綠，含「已超支」與「未超支」兩種案例
- [ ] alembic upgrade/downgrade round-trip OK
- [ ] 當日 / 當月的期間邊界依 `Settings.API_TZ` 計算（非 UTC 天界，→ rules/00-core/03-timezone.md）

## 必讀檔（Just-in-time）

- rules/20-backend/08-performance.md
- rules/30-database/07-alembic.md
- rules/00-core/03-timezone.md
