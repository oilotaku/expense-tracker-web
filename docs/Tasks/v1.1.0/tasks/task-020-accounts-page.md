---
id: task-020
title: 帳戶管理頁（新頁）
status: done
parallel: true
depends_on: [task-007, task-008, task-011, task-005]
affected_files:
  - frontend/src/app/accounts/page.tsx
  - frontend/src/app/accounts/page.test.tsx
  - frontend/src/components/accounts/AccountCard.tsx
  - frontend/src/components/accounts/AccountCard.test.tsx
  - frontend/src/lib/api/accountsApi.ts
  - frontend/src/lib/api/accountsApi.test.ts
estimated_hours: 5
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/05-components.md, rules/10-frontend/06-rwd.md]
---
## 目標

`design-spec.md` §9.6：新頁 `/accounts`，`accountsApi.ts`（RTK Query）串接既有 `/api/v1/accounts` CRUD + task-005 新增的 `color`/`icon` 欄位。`<AccountCard>` 讀 API 回傳的 `color`/`icon`；新增/編輯表單含 `<ColorSwatchPicker>`/`<IconPicker>`（task-011），新增帳戶未手動選色時前端預帶下一個未使用的色票。刪除保護：只剩 1 個帳戶時刪除按鈕 disabled 並顯示原因（`→ A4`）。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：帳戶清單渲染 `color`/`icon`、新增/改名/改色/改圖示、只剩 1 個帳戶時刪除按鈕 disabled 且顯示提示文字、刪除前若有交易掛載顯示既有警告文字
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/05-components.md
- rules/10-frontend/06-rwd.md
