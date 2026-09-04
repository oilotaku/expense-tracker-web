---
id: task-013
title: Dashboard 彙總 API 前端串接
status: done
blocked_reason: >
  已解除：task-027（commit a27b584）補齊 msw@2.15.0 為真實 devDependency 並修正
  eslint 掃描範圍。dashboardApi.test.ts 已補上（commit c29946c），用 msw mock
  GET /api/v1/dashboard/summary 成功/422/401 三種回應，`npm run test -- --run`
  全綠（87/87，含本檔 3 條）；`dashboardApi.ts`/`dashboardApi.test.ts` 兩檔單獨
  typecheck 與 eslint 皆綠。詳見 docs/Tasks/v1.1.0/fixed.md §1 的原始根因記錄。
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

- [x] `npm run test -- --run` 全綠，含 MSW mock `GET /api/v1/dashboard/summary` 成功/422/401 三種回應的 hook 行為
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
