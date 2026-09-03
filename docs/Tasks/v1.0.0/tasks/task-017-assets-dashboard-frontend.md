---
id: task-017
title: 資產 / 負債前端頁（含總覽 dashboard）
status: pending
parallel: false
depends_on: [task-016]
affected_files:
  - frontend/src/lib/api/assetsApi.ts
  - frontend/src/app/assets/page.tsx
  - frontend/src/app/dashboard/page.tsx
estimated_hours: 6
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/05-components.md]
---
## 目標

資產（股票 / 貴金屬）與負債的輸入頁；dashboard 頁顯示總資產 / 總負債 / 淨資產（呼叫 task-016 的彙總 API）。

## Acceptance

- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功
- [ ] `npm run test -- --run` 涵蓋 dashboard 數字渲染（`msw` mock net-worth API 回應）

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/05-components.md
