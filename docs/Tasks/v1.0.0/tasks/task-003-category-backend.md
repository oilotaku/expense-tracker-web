---
id: task-003
title: 分類 Category（後端，含系統預設種子）
status: done
parallel: true
depends_on: [task-001]
affected_files:
  - backend/app/models/category.py
  - backend/app/schemas/category.py
  - backend/app/api/v1/categories.py
  - backend/app/repositories/category_repository.py
  - backend/alembic/versions/{rev}_add_categories.py
  - backend/tests/api/test_categories.py
estimated_hours: 3
rules: [rules/20-backend/01-routing.md, rules/30-database/07-alembic.md, rules/30-database/01-identifiers.md]
---
## 目標

分類是固定清單但可增刪（見 propose In Scope「分類為系統預設的固定清單」）：使用者註冊後取得一組系統預設分類（餐飲/交通/娛樂…），可自行增刪。分類與標籤是分開欄位，不合併。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_categories.py` 全綠
- [ ] 新使用者註冊後查詢 `/api/v1/categories` 回傳筆數 > 0（系統預設種子已套用）
- [ ] alembic upgrade/downgrade round-trip OK

## 必讀檔（Just-in-time）

- rules/20-backend/01-routing.md
- rules/30-database/07-alembic.md
- rules/30-database/01-identifiers.md
