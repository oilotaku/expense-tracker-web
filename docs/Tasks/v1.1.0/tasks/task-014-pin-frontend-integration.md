---
id: task-014
title: PIN 前端串接（authApi + useDeviceAccounts）
status: done
parallel: true
depends_on: [task-002]
affected_files:
  - frontend/src/lib/api/authApi.ts
  - frontend/src/hooks/useDeviceAccounts.ts
  - frontend/src/hooks/useDeviceAccounts.test.ts
estimated_hours: 3
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/03-env-and-auth.md]
---
## 目標

`design-spec.md` §12.2/§A3：`authApi.ts` 擴充 task-002 的 4 個 PIN endpoint（`setPin`/`changePin`/`deletePin`/`loginWithPin` mutations）。`useDeviceAccounts` hook 讀寫「本裝置記住的帳號」`localStorage`（遮罩 email + 顯示名稱 + 頭像色 + `user_uid`），PIN 本身**不**存於 localStorage；`loginWithPin` 成功寫入/更新清單，`deletePin` 成功後清除該帳號的快速登入旗標。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：4 個 PIN mutation 的成功/失敗（401/409/429）處理、`useDeviceAccounts` 新增/移除/讀取裝置帳號清單、`localStorage` 內容不含 PIN 或密碼明文
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/03-env-and-auth.md
