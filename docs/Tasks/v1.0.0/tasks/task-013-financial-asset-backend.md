---
id: task-013
title: 金融資產 FinancialAsset（後端，張/股、兩/錢換算）
status: done
parallel: false
depends_on: [task-001, task-011, task-012]
affected_files:
  - backend/app/models/financial_asset.py
  - backend/app/schemas/financial_asset.py
  - backend/app/api/v1/financial_assets.py
  - backend/app/utils/unit_conversion.py
  - backend/alembic/versions/{rev}_add_financial_assets.py
  - backend/tests/utils/test_unit_conversion.py
estimated_hours: 5
rules: [rules/30-database/05-precision.md, rules/30-database/07-alembic.md]
---
## 目標

金融資產 CRUD：股票（股號、輸入單位為「張」或「股」）、貴金屬（品項、輸入單位為「兩」或「錢」）。單位換算為共用函式：1 張 = 1000 股、1 兩 = 10 錢；儲存原始輸入值與單位，另存換算後的基本單位數量（股數 / 錢數），供 task-014 抓價與 task-016 彙總使用。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/utils/test_unit_conversion.py` 全綠，含「1 張 = 1000 股」「1 兩 = 10 錢」「輸入 0 或負數應拒絕」邊界案例
- [ ] alembic upgrade/downgrade round-trip OK
- [ ] 數量欄位為 Numeric，不用 float（→ rules/30-database/05-precision.md）

## 必讀檔（Just-in-time）

- rules/30-database/05-precision.md
- rules/30-database/07-alembic.md
