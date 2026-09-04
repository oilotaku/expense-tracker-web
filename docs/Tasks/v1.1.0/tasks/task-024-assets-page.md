---
id: task-024
title: 資產頁視覺重做
status: done
parallel: true
depends_on: [task-009]
affected_files:
  - frontend/src/app/assets/page.tsx
  - frontend/src/app/assets/page.test.tsx
estimated_hours: 3
rules: [rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §9.5：`/assets` 頁沿用既有 API 與互動邏輯，只做視覺重新套用：`<CurvedCard>`（task-009）、金額語意色套用 §2.3、按鈕改用新 `cva` variant。不重新設計版面結構。

## Acceptance

- [x] `npm run test -- --run` 全綠（既有測試案例改用新元件後仍全數通過）
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
