---
id: task-031
title: 設定 PIN 成功後從未呼叫 rememberAccount，PIN 快速登入入口永遠不出現（e2e 發現，功能阻斷）
status: done
parallel: true
depends_on: []
affected_files:
  - frontend/src/app/settings/page.tsx
  - frontend/src/app/settings/page.test.tsx
estimated_hours: 1
rules: [rules/10-frontend/05-components.md]
---

> 來源：task-026 e2e 執行中發現（CORE-068，優先序高——PIN 快速登入是本版最核心的需求之一，目前使用者實際完全走不到 PIN 登入畫面）。

## 目標

**根因**：`frontend/src/hooks/useDeviceAccounts.ts`（task-014 已完成）提供 `rememberAccount({ user_uid, email })`，供成功設定/登入 PIN 後把裝置記住的帳號寫進 `localStorage`。但 `frontend/src/app/settings/page.tsx`（task-021）目前只解構了 `forgetAccount`（`const { forgetAccount } = useDeviceAccounts()`），**從未呼叫 `rememberAccount`**。`frontend/src/app/login/page.tsx`（task-018）也只解構 `accounts` 來顯示清單，同樣沒有任何地方寫入。結果是：`useDeviceAccounts().accounts` 永遠是空陣列，`/login` 的 `<AccountSwitcherList>`／「改用 PIN 快速登入」入口永遠不會出現，PIN 這個功能實際上使用者完全走不到。

**修正方向**：`settings/page.tsx` 的「首次設定 PIN」流程（`POST /auth/pin` 成功之後），呼叫 `rememberAccount({ user_uid: me.user_uid, email: me.email })`（`me` 來自既有 `useGetMeQuery()`，第 408 行附近已有）。「停用 PIN」流程已經正確呼叫 `forgetAccount`，不用動。「變更 PIN」（`PATCH /auth/pin`）不需要額外呼叫（帳號本來就已經記住過）。

## Acceptance

- [x] `settings/page.tsx` 首次設定 PIN 成功後呼叫 `rememberAccount`，`localStorage`（key `device-accounts`）內容包含該帳號
- [x] `settings/page.test.tsx` 新增至少一條測試斷言：成功設定 PIN 後 `rememberAccount` 被呼叫（或直接斷言 `useDeviceAccounts` 底層 `localStorage` 的最終狀態），比照既有測試的 mock/斷言慣例
- [x] `docker run --rm -v "$PWD/frontend:/app" -w /app node:24-alpine sh -c "npm run test -- --run"` 全綠（比照 `tasks-v1.1.0.md` 頂部環境備註的驗證方式）
- [x] `npm run typecheck` / `npm run lint`（同上容器方式）全綠
- [x] `npm run build`（同上容器方式）成功
- [x] `git status --porcelain` 只多出本 task 的 2 個 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/design-spec.md` §1 `[A3]`（裝置記住帳號機制）、§9.7（設定頁 PIN 設定流程）
- `frontend/src/hooks/useDeviceAccounts.ts`（`rememberAccount`/`RememberAccountInput` 簽章）
- `frontend/src/app/login/page.tsx`（讀 `accounts` 決定要不要顯示 PIN 入口，確認你的修正真的能讓這裡生效）
