---
id: task-004
title: 分類 Category 後端擴充（顏色/圖示 + 訂閱種子）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/models/category.py
  - backend/alembic/versions/{rev}_add_color_icon_to_categories.py
  - backend/alembic/versions/{rev}_add_subscription_category.py
  - backend/app/schemas/category.py
  - backend/app/api/v1/categories.py
  - backend/app/repositories/category_repository.py
  - backend/tests/api/test_categories.py
estimated_hours: 4
rules: [rules/30-database/07-alembic.md, rules/20-backend/01-routing.md, rules/00-core/04-api-docs.md]
---
## 目標

`design-spec.md` §12.4：`Category` 新增 `color`（`String(7)` not null，後端驗證 `^#[0-9A-Fa-f]{6}$`）與 `icon`（`String(50)` not null，只驗證非空/長度，不做 enum）；migration 對既有列做資料回填（複製既有前端雜湊配色邏輯挑初始色，避免既有使用者視覺跳動）。`CategoryRepository.create`/`update_name` 擴充（或新增 `update_fields`）接受 `color`/`icon`；`categories.py` router 的 create/update endpoint 傳入新欄位；`CategoryCreateRequest`/`CategoryUpdateRequest`/`CategoryResponse` 對應調整。**另**新增獨立 migration（`→ A17`，**不**回頭改既有 `2026_09_04_0900-add_categories.py`）：`seed_default_categories()` function `CREATE OR REPLACE` 納入「訂閱」，新順序**餐飲、交通、娛樂、購物、醫療、居住、訂閱、薪資、其他**；對既有使用者做 `WHERE NOT EXISTS`（比對 `user_uid + name`）的 backfill INSERT，避免對已手動建立同名「訂閱」分類的使用者觸發 unique constraint 衝突。

## Acceptance

- [ ] `docker compose exec backend uv run pytest tests/api/test_categories.py` 全綠，含：建立分類帶 `color`/`icon`、`color` 格式錯誤回 422、更新分類的 `color`/`icon`、既有使用者升級後自動補上「訂閱」分類、已手動建立同名「訂閱」分類的使用者升級不觸發衝突、新使用者註冊種子清單含「訂閱」且順序符合規格
- [ ] alembic `upgrade head` / `downgrade -1` round-trip OK（兩支新 migration）
- [ ] `docker compose exec backend uv run mypy app` 全綠

## 必讀檔（Just-in-time）

- rules/30-database/07-alembic.md
- rules/20-backend/01-routing.md
- rules/00-core/04-api-docs.md
