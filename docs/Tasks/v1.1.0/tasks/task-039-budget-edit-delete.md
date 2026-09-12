---
id: task-039
title: 預算頁新增編輯上限金額與刪除功能
status: done
parallel: true
depends_on: []
affected_files:
  - frontend/src/lib/api/budgetsApi.ts
  - frontend/src/app/budgets/page.tsx
  - frontend/src/app/budgets/page.test.tsx
estimated_hours: 2
rules: []
---

> 來源：使用者反映「預算修改 刪除」找不到入口（CORE-068 拆補洞 task，新編號不覆寫既有 task）。查證後確認同一種「後端早已支援、前端從未串接」的落差模式（同 task-034 balance、fixed.md §15）：`backend/app/api/v1/budgets.py` 的 `PATCH /budgets/{uid}`／`DELETE /budgets/{uid}` 與對應測試（`test_update_budget_limit`／`test_delete_budget_is_soft_delete`）本來就存在，只是 `frontend/src/lib/api/budgetsApi.ts` 從未 export 對應 mutation，`budgets/page.tsx` 也沒有任何編輯/刪除 UI。

## 目標

- `budgetsApi.ts` 新增 `useUpdateBudgetMutation`（PATCH，body `{ limit_amount }`）與 `useDeleteBudgetMutation`（DELETE），invalidate 對應 `Budget` tag 讓清單與花費彙總一起重抓。
- `BudgetProgressCard` 新增編輯（✎ 展開上限金額輸入框，draft + blur/Enter 提交，同 `AccountCard.tsx` 既有慣例）與刪除（✕ 走 `<ConfirmDialog>`，同 accounts/categories 頁既有慣例）。
- 不改動後端（schema/repository/endpoint 本來就支援）。

## Acceptance

- [x] 點編輯展開上限金額輸入框，修改後 blur 或按 Enter 呼叫 `updateBudget({ budgetUid, limit_amount })`
- [x] 點刪除走 `<ConfirmDialog>`，確認後呼叫 `deleteBudget(budgetUid)`
- [x] `docker run node:24-alpine ... npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全綠（345 個測試，含新增的 2 個案例）
- [x] `git status --porcelain` 只多出本 task 的 3 個 `affected_files`

## 必讀檔（Just-in-time）

- `backend/app/api/v1/budgets.py`（既有 PATCH/DELETE 端點，確認後端無需改動）
- `frontend/src/components/accounts/AccountCard.tsx`（既有 draft + blur/Enter 提交慣例）
- `docs/Tasks/v1.1.0/fixed.md` §15（同一類「schema/型別已就緒但 UI 沒串接」根因，第三次出現）
