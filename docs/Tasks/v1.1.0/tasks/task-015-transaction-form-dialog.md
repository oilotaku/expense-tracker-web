---
id: task-015
title: 新增/編輯交易表單（TransactionFormDialog + RecurringFieldset）
status: done
parallel: true
depends_on: [task-006, task-008, task-010, task-003]
affected_files:
  - frontend/src/components/transactions/TransactionFormDialog.tsx
  - frontend/src/components/transactions/TransactionFormDialog.test.tsx
  - frontend/src/components/transactions/RecurringFieldset.tsx
  - frontend/src/components/transactions/RecurringFieldset.test.tsx
estimated_hours: 7
rules: [rules/10-frontend/05-components.md, rules/10-frontend/06-rwd.md, rules/00-core/03-timezone.md]
---
> 2026-09-05 CORE-068 修正：原本要求本 task 一併刪除 `frontend/src/components/TransactionForm.tsx`+test，但該檔仍被 `frontend/src/app/transactions/page.tsx`（task-017 的 affected_files）import，刪除會讓 task-017 完成前的 typecheck/build 整專案炸掉。刪除職責移交 task-017（該 task 尚未開工，已同步更新其 affected_files/Acceptance）。本 task 只負責新增 `TransactionFormDialog`/`RecurringFieldset`，舊 `TransactionForm.tsx` 保留不動，交由 task-017 收尾時移除。

## 目標

`design-spec.md` §7 全節：新增 `transactions/TransactionFormDialog.tsx` + `RecurringFieldset.tsx`，未來取代既有 `frontend/src/components/TransactionForm.tsx`（實際刪除舊檔由 task-017 負責，見上方修正說明），`react-hook-form` + `zod` schema 驗證。表單初始只顯示「收支類型／日期／金額」三必填 + 「更多欄位」展開連結（行動端摺疊、桌機預設展開），留白時分類補「其他」、明細/支付方式送空字串（`→ A5`，已決議維持，不做後端 `NULL` migration）。金額欄用 `<NumericKeypad mode="amount">`（task-010）。`<RecurringFieldset>` 週期單位（週/月/年）全面開放、間隔數字 1–99（`→ A16`）、起算日日期選擇器（`anchor_date`，串接 task-003 的新欄位）。桌機 `<Dialog>` / 行動端 BottomSheet（task-008），BottomSheet 滑入動畫遵守 `useReducedMotion()`。

## Acceptance

- [ ] `npm run test -- --run` 全綠，含：三必填欄位驗證（金額 > 0、日期必填、收支類型必選）、留白分類/明細/支付方式送出的預設值、`RecurringFieldset` 週/月/年三種單位可選、`interval_count` 超出 1–99 範圍時前端擋下不送出、編輯模式預帶既有值
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
- rules/10-frontend/06-rwd.md
- rules/00-core/03-timezone.md
