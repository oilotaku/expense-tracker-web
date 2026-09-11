---
id: task-033
title: 交易清單 N+1 查詢修正（批次撈標籤）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/api/v1/transactions.py
  - backend/app/repositories/transaction_repository.py
  - backend/tests/api/test_transactions.py
estimated_hours: 1
rules: [BE-095, DB-059]
---

> 來源：使用者請求的專案改善優化建議掃描（非 task-016 執行中發現，CORE-068 拆補洞 task，新編號不覆寫既有 task）。違反 `→ BE-095`「service 禁在迴圈內呼叫 repository」與 `→ DB-059`「列表查詢會用到的關聯必明示預載」的精神。

## 目標

`backend/app/api/v1/transactions.py` 的 `list_transactions()`（`GET /transactions`）在分頁查完交易後，對每一筆交易各自呼叫一次 `repo.list_tags_for_transaction_uid()` 撈標籤：

```python
items = [
    _to_response(t, list(await repo.list_tags_for_transaction_uid(t.transaction_uid)))
    for t in transactions
]
```

100 筆分頁會打出最多 101 次 DB 往返。`Transaction`/`Tag` 之間是透過 `transaction_tags` 關聯表手寫查詢（未用 SQLAlchemy `relationship()`），無法直接套 `selectinload`，因此改在 `TransactionRepository` 新增批次方法 `list_tags_by_transaction_uids()`，用單次 `transaction_tags.c.transaction_uid.in_(...)` 查詢一次撈完整頁的標籤，回傳 `dict[UUID, list[Tag]]`；API 層改呼叫一次批次方法，不在迴圈內呼叫 repository。

## Acceptance

- [x] `GET /transactions` 分頁清單不論頁面大小，撈標籤只發一次額外 SQL 查詢（`list_tags_by_transaction_uids` 單次 `IN` 查詢，取代逐筆 `list_tags_for_transaction_uid`）
- [x] `docker run ... uv run pytest tests/api/test_transactions.py -v` 全綠，含新增的批次映射正確性測試（`test_list_transactions_returns_correct_tags_per_item`：驗證多筆交易各自的標籤不會配錯，含一筆無標籤的交易）
- [x] `uv run mypy app` 全綠
- [x] `uv run ruff check . && uv run ruff format --check .` 全綠
- [x] `git status --porcelain` 只多出本 task 的 3 個 `affected_files`

## 必讀檔（Just-in-time）

- `rules/20-backend/08-performance.md`（BE-095）
- `rules/30-database/08-indexes-and-perf.md`（DB-059）
