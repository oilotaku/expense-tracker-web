---
id: task-025
title: 註冊頁視覺重做
status: done
parallel: true
depends_on: [task-007, task-009]
affected_files:
  - frontend/src/app/register/page.tsx
  - frontend/src/app/register/page.test.tsx
estimated_hours: 2
rules: [rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §11：`/register` 頁保留路由與既有 API，只套新視覺（`--radius-md` 輸入框、`--color-primary-600` 主按鈕、`<WaveDivider>` 裝飾，task-009），不改表單欄位與驗證邏輯。

## Acceptance

- [x] `npm run test -- --run` 全綠（既有註冊表單驗證/送出邏輯不變）
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
