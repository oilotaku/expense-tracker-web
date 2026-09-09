---
id: task-023
title: 預算頁視覺重做
status: done
parallel: true
depends_on: [task-009]
affected_files:
  - frontend/src/app/budgets/page.tsx
  - frontend/src/app/budgets/page.test.tsx
estimated_hours: 3
rules: [rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §9.5：`/budgets` 頁沿用既有 API 與互動邏輯，只做視覺重新套用：`<CurvedCard>`（task-009）、進度條改用 §2.3 定義的 meter 樣式（track = 該狀態色淡階、fill = 該狀態色，icon + 文字並行、不單靠顏色，正常/接近上限/超支三態）。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：三種預算狀態（正常/接近上限/超支）皆同時渲染 icon 與文字（不只靠顏色）
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
