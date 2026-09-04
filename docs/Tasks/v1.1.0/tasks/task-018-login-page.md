---
id: task-018
title: 登入頁重做（PIN + 密碼雙模式）
status: done
parallel: true
depends_on: [task-007, task-008, task-010, task-014]
affected_files:
  - frontend/src/app/login/page.tsx
  - frontend/src/app/login/page.test.tsx
  - frontend/src/components/auth/PinLoginPad.tsx
  - frontend/src/components/auth/PinLoginPad.test.tsx
  - frontend/src/components/auth/AccountSwitcherList.tsx
  - frontend/src/components/auth/AccountSwitcherList.test.tsx
estimated_hours: 6
rules: [rules/10-frontend/03-env-and-auth.md, rules/10-frontend/06-rwd.md, rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §9.1：同一 `<LoginView>`，`useBreakpoint('md')`（task-009）只決定**預設顯示哪個子畫面**（行動端有記住帳號時預設帳號選擇器 + PIN、桌機預設 Email+密碼表單），非另建路由（`→ FE-063` 例外）。`<AccountSwitcherList>` 讀 `useDeviceAccounts`（task-014）；點選帳號後用 `<PinLoginPad>`（內用 `<NumericKeypad mode="pin" autoComplete="current-password">`，task-010）呼叫 `loginWithPin` mutation（task-014）。密碼表單維持既有 `authApi` 登入邏輯不變。

## Acceptance

- [ ] `npm run test -- --run` 全綠，含：行動端有記住帳號時預設顯示帳號選擇器、無記住帳號時預設密碼表單、`PinLoginPad` 輸入滿 6 碼自動送出並在成功後導向 `/dashboard`、PIN 錯誤顯示訊息且不導頁、鎖定（429）時顯示改用密碼登入提示
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/03-env-and-auth.md
- rules/10-frontend/06-rwd.md
- rules/10-frontend/05-components.md
