---
id: task-006
title: 交易輸入 / 清單前端頁
status: done
parallel: false
depends_on: [task-004]
affected_files:
  - frontend/src/lib/api/transactionsApi.ts
  - frontend/src/app/transactions/page.tsx
  - frontend/src/components/TransactionForm.tsx
  - frontend/src/components/TransactionList.tsx
estimated_hours: 5
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/05-components.md, rules/10-frontend/04-datetime.md]
---
## 目標

交易表單（分類 / 標籤 / 帳戶下拉選單）+ 清單（可依日期區間、分類篩選），呼叫 task-004 的 API。

## Acceptance

- [ ] `npm run test -- --run` 全綠，涵蓋表單送出觸發 RTK Query mutation（`msw` mock API）
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/05-components.md
- rules/10-frontend/04-datetime.md
