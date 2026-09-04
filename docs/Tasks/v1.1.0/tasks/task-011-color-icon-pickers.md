---
id: task-011
title: 色票 / 圖示選擇器
status: done
parallel: true
depends_on: [task-007]
affected_files:
  - frontend/src/components/common/ColorSwatchPicker.tsx
  - frontend/src/components/common/ColorSwatchPicker.test.tsx
  - frontend/src/components/common/IconPicker.tsx
  - frontend/src/components/common/IconPicker.test.tsx
estimated_hours: 4
rules: [rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §8/§9.6/§12.4：`<ColorSwatchPicker>` 提供 §2.3 圖表 8 色固定色票 + 自訂 hex 輸入（驗證 `^#[0-9A-Fa-f]{6}$`，格式錯誤禁用送出）；`<IconPicker>` 提供固定圖示集（inline SVG，非 emoji，`→` 設計原則）供分類/帳戶表單共用。兩元件皆受控（`value`/`onChange`），不自行呼叫 API。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：`ColorSwatchPicker` 點擊色票觸發 `onChange`、自訂 hex 輸入格式錯誤時不觸發 `onChange`、`IconPicker` 點擊圖示觸發 `onChange`
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
