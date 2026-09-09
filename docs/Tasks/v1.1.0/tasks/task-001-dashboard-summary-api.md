---
id: task-001
title: Dashboard 期間彙總 API（後端）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/api/v1/dashboard.py
  - backend/app/api/v1/__init__.py
  - backend/app/schemas/dashboard.py
  - backend/app/services/dashboard_service.py
  - backend/tests/api/test_dashboard.py
estimated_hours: 4
rules: [rules/20-backend/01-routing.md, rules/20-backend/08-performance.md, rules/30-database/08-indexes-and-perf.md, rules/00-core/03-timezone.md]
---
## 目標

新增 `GET /api/v1/dashboard/summary`（`design-spec.md` §12.1），依 `period`（month/year/custom）+ `date_from`/`date_to` 回傳收入/支出/結餘/預算結餘彙總，比照 `backend/app/api/v1/net_worth.py` 的「純彙總、無 CRUD」頂層資源慣例，掛進 `backend/app/api/v1/__init__.py`（`tags=["dashboard"]`）。`income`/`expense` 用一次 SQL `GROUP BY transaction_type` 加總；`budget_remaining` 僅 `period == "month"` 計算（沿用 `BudgetService.get_summary` 邏輯加總所有月度預算），`period != "month"` 一律回 `null`，使用者未設定任何月度預算時回 `0.00`（非 `null`）。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_dashboard.py` 全綠，含：月/年/自訂範圍三種 `period`、`budget_remaining` 在 `period != month` 為 `null`、在 `period == month` 且無預算時為 `0.00`、`date_to < date_from` 回 422
- [ ] 未帶 JWT 呼叫 `/api/v1/dashboard/summary` 回 401
- [ ] `curl` 帶合法 `period=month&date_from=...&date_to=...` 回應 `data.income`/`data.expense`/`data.balance`/`data.budget_remaining` 四欄皆存在（`| jq -e '.data | has("income") and has("expense") and has("balance") and has("budget_remaining")'`）
- [ ] `docker compose exec backend uv run mypy app` 全綠

## 必讀檔（Just-in-time）

- rules/20-backend/01-routing.md
- rules/20-backend/08-performance.md
- rules/30-database/08-indexes-and-perf.md
- rules/00-core/03-timezone.md
