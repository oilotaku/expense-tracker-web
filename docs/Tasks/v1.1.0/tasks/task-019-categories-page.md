---
id: task-019
title: 分類管理頁（新頁）
status: done
parallel: true
depends_on: [task-007, task-008, task-011, task-004]
affected_files:
  - frontend/src/app/categories/page.tsx
  - frontend/src/app/categories/page.test.tsx
  - frontend/src/components/categories/CategoryChip.tsx
  - frontend/src/components/categories/CategoryChip.test.tsx
  - frontend/src/lib/api/categoriesApi.ts
  - frontend/src/lib/api/categoriesApi.test.ts
estimated_hours: 5
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/05-components.md, rules/10-frontend/06-rwd.md]
---
## 目標

`design-spec.md` §8：新頁 `/categories`，`categoriesApi.ts`（RTK Query）串接既有 `/api/v1/categories` CRUD + task-004 新增的 `color`/`icon` 欄位。Grid 卡片（`<CategoryChip>`，讀 API 回傳的 `color`/`icon`，**不**再前端雜湊）；新增列含 `<ColorSwatchPicker>`/`<IconPicker>`（task-011）；刪除走 `<ConfirmDialog>`（task-008）。桌機四欄 grid + hover 顯示刪除、行動端兩欄 grid + 長按顯示刪除。

## Acceptance

- [ ] `npm run test -- --run` 全綠，含：分類清單含「訂閱」且渲染其 `color`/`icon`、新增分類帶色票/圖示選擇、重名前端即時驗證、後端 409 時顯示錯誤訊息、刪除走 `ConfirmDialog`
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/05-components.md
- rules/10-frontend/06-rwd.md
