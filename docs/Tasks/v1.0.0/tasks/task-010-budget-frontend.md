---
id: task-010
title: 預算前端頁（設定 + 進度顯示）
status: pending
parallel: false
depends_on: [task-009]
affected_files:
  - frontend/src/lib/api/budgetsApi.ts
  - frontend/src/app/budgets/page.tsx
estimated_hours: 3
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/05-components.md]
---
## 目標

預算設定表單（分類 + 當月/當日 + 上限金額）與各分類進度條顯示（已花費 / 上限），呼叫 task-009 的 API。

## Acceptance

- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功
- [ ] `npm run test -- --run` 涵蓋超支時進度條顯示為警示樣式的邏輯

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/05-components.md
