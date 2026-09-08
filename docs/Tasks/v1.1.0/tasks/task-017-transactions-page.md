---
id: task-017
title: 交易清單頁重做
status: done
parallel: true
depends_on: [task-008, task-015]
affected_files:
  - frontend/src/app/transactions/page.tsx
  - frontend/src/app/transactions/page.test.tsx
  - frontend/src/components/TransactionList.tsx
  - frontend/src/components/TransactionList.test.tsx
  - frontend/src/components/TransactionForm.tsx
  - frontend/src/components/TransactionForm.test.tsx
estimated_hours: 5
rules: [rules/10-frontend/05-components.md, rules/10-frontend/06-rwd.md]
---
> 2026-09-05 CORE-068 修正：本 task 額外接手刪除 `frontend/src/components/TransactionForm.tsx`+test 的職責（原本掛在 task-015，但該檔仍被本頁 import，只能等本頁換成 `TransactionFormDialog` 後才能安全刪除，見 task-015 檔內修正說明）。

## 目標

`design-spec.md` §9.3：桌機表格式、行動端卡片堆疊（同一路由 `md:` 切版，`→ FE-054/055/063`），篩選（期間/分類/帳戶/類型）行動端收進 `<Dialog>`（BottomSheet 樣式，task-008）。編輯點列開 task-015 的 `<TransactionFormDialog mode="edit">` 預帶值；刪除走 `<ConfirmDialog>`（task-008）。**本頁改用 `<TransactionFormDialog>` 後，移除已無人使用的舊 `frontend/src/components/TransactionForm.tsx`+test。**

## Acceptance

- [ ] `npm run test -- --run` 全綠，含：點列開啟編輯表單並預帶既有值、刪除觸發 `ConfirmDialog` 且確認後呼叫刪除 API、篩選條件變更觸發重新查詢
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功
- [ ] `git status --porcelain -- frontend/src/components/TransactionForm.tsx frontend/src/components/TransactionForm.test.tsx` 顯示已刪除（`D`）

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
- rules/10-frontend/06-rwd.md
