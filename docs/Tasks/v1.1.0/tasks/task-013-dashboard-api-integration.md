---
id: task-013
title: Dashboard 彙總 API 前端串接
status: blocked
blocked_reason: >
  frontend/src/lib/api/dashboardApi.ts 實作已完成（GET /api/v1/dashboard/summary，
  useGetDashboardSummaryQuery({ period, dateFrom, dateTo })），typecheck 與單檔 eslint
  全綠。但 Acceptance 要求 dashboardApi.test.ts 用 msw mock HTTP（成功/422/401），實際
  查出 msw 從未成為 frontend/package.json 的真實 dependency（package-lock.json 內僅是
  @vitest/mocker 的 optional peerDependency，npm ci 不會裝，node_modules 內也不存在）；
  task-006 未補這個依賴，且 frontend/package.json / package-lock.json 不在本 task
  affected_files 內，依 CORE-140 停手不擅自改。詳見 docs/Tasks/v1.1.0/fixed.md §1。
  建議另拆一個小 task（affected_files 明確列 package.json / package-lock.json，鎖版
  msw@2.15.0）補齊依賴後，task-013 才能完成 dashboardApi.test.ts 並標 done。
parallel: true
depends_on: [task-001]
affected_files:
  - frontend/src/lib/api/dashboardApi.ts
  - frontend/src/lib/api/dashboardApi.test.ts
estimated_hours: 2
rules: [rules/10-frontend/02-api-and-state.md]
---
## 目標

RTK Query slice 串接 task-001 的 `GET /api/v1/dashboard/summary`，比照既有 `frontend/src/lib/api/assetsApi.ts`/`budgetsApi.ts` 的 `baseApi.injectEndpoints` 慣例，暴露 `useGetDashboardSummaryQuery({ period, dateFrom, dateTo })`。

## Acceptance

- [ ] `npm run test -- --run` 全綠，含 MSW mock `GET /api/v1/dashboard/summary` 成功/422/401 三種回應的 hook 行為
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
