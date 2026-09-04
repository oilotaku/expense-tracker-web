---
id: task-003
title: recurring_rules 週期擴充（後端）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/models/recurring_rule.py
  - backend/alembic/versions/{rev}_add_interval_to_recurring_rules.py
  - backend/app/schemas/recurring_rule.py
  - backend/app/api/v1/recurring_rules.py
  - backend/app/services/recurring_service.py
  - backend/app/repositories/recurring_rule_repository.py
  - backend/tests/services/test_recurring_service.py
  - backend/tests/api/test_recurring_rules.py
estimated_hours: 6
rules: [rules/30-database/07-alembic.md, rules/20-backend/03-async-and-tx.md, rules/00-core/03-timezone.md]
---
## 目標

`design-spec.md` §12.3：`RecurringRule` 新增 `interval_unit`（`week`/`month`/`year`，StrEnum，比照 `BudgetPeriodType`/`TransactionType` 既有 `native_enum=False` + `values_callable` 寫法）、`interval_count`（`CheckConstraint(interval_count BETWEEN 1 AND 99)`，`→ A16`）、`anchor_date`（`Date`, not null）三欄；既有 `day_of_month` 欄位**保留**但放寬為 nullable（不刪欄位）。Migration 依序：加三欄（`interval_unit`/`interval_count` 有 default、`anchor_date` 先允許 NULL）→ 回填既有規則的 `anchor_date`（由 `created_at` 所在月份 + `day_of_month` 反推）→ `anchor_date` 收緊 NOT NULL → `day_of_month` 放寬 nullable。服務層改用 `anchor_date` + `interval_unit` + `interval_count` 算下一次執行日：`month` 沿用「超過當月天數夾到月底」；`year` 遇 `anchor_date` 為 2/29、目標年非閏年時，比照同一條規則夾到 2/28（`→ tasks-v1.1.0.md` 頂部盲點掃描備註）。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/services/test_recurring_service.py` 全綠，含：`week`/`month`/`year` 三種單位各算出正確下一次執行日、`interval_count` > 1 的間隔計算、`month` 超過當月天數夾到月底（既有行為不變）、`year` 遇 2/29 非閏年夾到 2/28
- [ ] `docker compose exec backend uv run pytest tests/api/test_recurring_rules.py` 全綠，含既有月規則資料回填後 `anchor_date`/`interval_unit`/`interval_count` 正確、`interval_count` 超過 99 回 422
- [ ] alembic `upgrade head` / `downgrade -1` round-trip OK；既有測試資料庫的既有規則列在 `upgrade head` 後 `day_of_month` 與行為（下一次執行日）與升級前一致
- [ ] `docker compose exec backend uv run mypy app` 全綠

## 必讀檔（Just-in-time）

- rules/30-database/07-alembic.md
- rules/20-backend/03-async-and-tx.md
- rules/00-core/03-timezone.md
