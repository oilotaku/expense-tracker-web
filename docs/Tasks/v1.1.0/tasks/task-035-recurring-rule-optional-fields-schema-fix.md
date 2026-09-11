---
id: task-035
title: 固定收支 description/payment_method 允許空字串（同步 task-028 的一次性交易慣例）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/schemas/recurring_rule.py
  - backend/tests/api/test_recurring_rules.py
estimated_hours: 1
rules: [BE-023]
---

> 來源：使用者請求「在新增所有有關交易紀錄時明細不用必填」（CORE-068 拆補洞 task，新編號不覆寫既有 task）。task-028（`fixed.md` §5）已把 `TransactionCreateRequest`/`TransactionUpdateRequest` 的 `description`/`payment_method` 改成允許空字串，但當時 `affected_files` 只涵蓋 `backend/app/schemas/transaction.py`，沒有一併掃到同樣的欄位定義也出現在 `backend/app/schemas/recurring_rule.py`（固定收支），這次一併補齊。

## 目標

`backend/app/schemas/recurring_rule.py` 的 `RecurringRuleCreateRequest`/`RecurringRuleUpdateRequest`：`description`/`payment_method` 原本是 `Field(min_length=1, ...)`，與一次性交易已決議的「留白送出空字串」（`→ A5`）不一致——共用同一個 `TransactionFormDialog.tsx` 表單的「固定收支」模式送出空白明細/支付方式時會被後端 422 拒絕。拿掉 `min_length=1`（同 task-028，不改型別、不做 nullable，DB 欄位本來就是 `NOT NULL` 但允許空字串）。

## Acceptance

- [x] `RecurringRuleCreateRequest(description="", payment_method="", ...)`（其餘欄位合法）建構不拋 `ValidationError`
- [x] `docker run ... uv run pytest tests/api/test_recurring_rules.py -v` 全綠，含新增的 `test_create_recurring_rule_with_blank_description_and_payment_method`、`test_update_recurring_rule_can_clear_description_and_payment_method`
- [x] `uv run mypy app` 全綠；`uv run ruff check . && uv run ruff format --check .` 全綠
- [x] `git status --porcelain` 只多出本 task 的 2 個 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/fixed.md` §5（task-028 原始決議與根因）
