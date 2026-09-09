---
id: task-028
title: 修正 TransactionCreateRequest description/payment_method 允許空字串（阻擋 A5 最小必填流程）
status: done
parallel: true
depends_on: []
affected_files:
  - backend/app/schemas/transaction.py
  - backend/tests/api/test_transactions.py
estimated_hours: 1
rules: [BE-023]
---

> 來源：task-016 執行中發現（CORE-068 拆補洞 task，新編號不覆寫既有 task）。**優先序高**：這是本版核心承諾「新增收支只需收支類型/日期/金額三個必填，其餘留白送出」（`→ propose-v1.1.0.md` 對外承諾、`design-spec.md` §7.1、`→ A5`）的阻斷性 bug——目前後端會直接 422 拒絕，A5 決議的「留白送空字串」方案實際上完全無法送出。

## 目標

`backend/app/schemas/transaction.py` 的 `TransactionCreateRequest`（第 33–41 行）：
```python
description: str = Field(min_length=1, max_length=255)
payment_method: str = Field(min_length=1, max_length=50)
```
`min_length=1` 導致前端依 `→ A5` 送出的空字串（使用者留白明細/支付方式時）被 Pydantic 直接拒絕（422），與 `design-spec.md` §7.1「留白送出空字串」的明確設計矛盾。`TransactionUpdateRequest`（第 44–51 行）的 `description`/`payment_method` 有相同問題（`min_length=1`，雖然 `default=None` 允許整欄不傳，但一旦傳空字串一樣 422）。

**修正方向**：把兩個 schema 的 `description`/`payment_method` 改成 `Field(max_length=...)`（拿掉 `min_length=1`，允許空字串），不改型別（仍是 `str`，不做 `str | None` 的 NULL 支援——`→ A5` 已決議不做 NULL migration，這只是放寬既有 NOT NULL 欄位的驗證下限，不是新增 nullable）。

## Acceptance

- [ ] `TransactionCreateRequest(description="", payment_method="", ...)`（其餘欄位合法）建構不拋 `ValidationError`
- [ ] `docker compose exec backend uv run pytest backend/tests/api/test_transactions.py -v` 全綠，且新增至少一條「description/payment_method 空字串成功建立交易」的測試 case
- [ ] `docker compose exec backend uv run mypy app` 全綠
- [ ] `docker compose exec backend uv run ruff check . && docker compose exec backend uv run ruff format --check .` 全綠
- [ ] `git status --porcelain` 只多出本 task 的 2 個 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/design-spec.md` §7.1（新增收支必填/選填欄位表，`→ A5`）
- `rules/20-backend/00-overview.md`（BE-023 認證模式等既有慣例）
