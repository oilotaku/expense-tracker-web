---
id: task-008
title: 週期性交易前端設定頁
status: done
parallel: false
depends_on: [task-007]
affected_files:
  - frontend/src/lib/api/recurringApi.ts
  - frontend/src/app/recurring/page.tsx
estimated_hours: 3
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/04-datetime.md]
---
## 目標

週期性交易規則的新增 / 清單頁，呼叫 task-007 的 API；表單限制「每月第幾天」輸入範圍 1–31。

## Acceptance

- [ ] `npm run test -- --run` 全綠，涵蓋「每月第幾天」欄位驗證（拒絕 0 或 > 31）
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/04-datetime.md
