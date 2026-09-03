---
id: task-005
title: 認證前端頁面
status: pending
parallel: true
depends_on: [task-001]
affected_files:
  - frontend/src/lib/api/authApi.ts
  - frontend/src/app/login/page.tsx
  - frontend/src/app/register/page.tsx
  - frontend/src/components/AuthGuard.tsx
estimated_hours: 4
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/03-env-and-auth.md, rules/10-frontend/01-routing-and-error.md]
---
## 目標

註冊 / 登入表單，呼叫 task-001 的 API；登入成功導向交易頁；`AuthGuard` 包住需登入的路由，未登入導回 `/login`。

## Acceptance

- [ ] `npm run test -- --run` 全綠，涵蓋 `AuthGuard` 未登入時導向 `/login` 的邏輯
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/03-env-and-auth.md
- rules/10-frontend/01-routing-and-error.md
