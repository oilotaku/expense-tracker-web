---
id: task-021
title: 設定頁（新頁）
status: done
parallel: true
depends_on: [task-007, task-008, task-010, task-014]
affected_files:
  - frontend/src/app/settings/page.tsx
  - frontend/src/app/settings/page.test.tsx
estimated_hours: 5
rules: [rules/10-frontend/03-env-and-auth.md, rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §9.7：新頁 `/settings`：個人資料（email 唯讀）、PIN 設定／變更／停用（呼叫 task-014 的 mutations，`<NumericKeypad mode="pin" autoComplete="new-password">` task-010、變更需先驗證舊 PIN、停用需輸入密碼）、外觀三態切換（`<ThemeToggle>`，task-009，`→ §2.7`）、預設記帳帳戶 Select（寫入 `localStorage`，`→ A11` 同機制）、登出。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：未設定 PIN 時顯示「設定 PIN」流程（需先輸入密碼）、已設定時顯示「變更 PIN」（需舊 PIN）與「停用」（需密碼）、外觀切換寫回 `localStorage`、預設記帳帳戶寫回 `localStorage`
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/03-env-and-auth.md
- rules/10-frontend/05-components.md
