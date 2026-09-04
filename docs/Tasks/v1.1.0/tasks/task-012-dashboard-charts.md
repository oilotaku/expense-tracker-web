---
id: task-012
title: Dashboard 圖表元件
status: done
parallel: true
depends_on: [task-006, task-007]
affected_files:
  - frontend/src/components/dashboard/ChartTypeSwitcher.tsx
  - frontend/src/components/dashboard/ChartTypeSwitcher.test.tsx
  - frontend/src/components/dashboard/CategoryPieChart.tsx
  - frontend/src/components/dashboard/CategoryBarChart.tsx
  - frontend/src/components/dashboard/TrendLineChart.tsx
  - frontend/src/hooks/useChartPreference.ts
  - frontend/src/hooks/useChartPreference.test.ts
estimated_hours: 6
rules: [rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §2.3/§4/§6：`recharts` 封裝三種圖表（圓餅/長條/折線），統一套用 §2.3 圖表色票（Light/Dark 依 `--color-*` token 讀取，`→ §2.3.1`），超過 6 類併入「其他」灰色（`→` Pie/Bar 折疊規則）。`<ChartTypeSwitcher>` 用 `useChartPreference` hook 讀寫 `localStorage`（`→ A11`，預設圓餅），切換用 `motion` 的 `AnimatePresence` 交叉淡入淡出（`useReducedMotion()` 降級）。折線圖 `<Line type="monotone">`，面積 wash 10% 透明度。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：`ChartTypeSwitcher` 切換寫回 `localStorage` 且下次載入讀回、超過 6 類分類自動併為「其他」、`prefers-reduced-motion` 時圖表切換無動畫過場
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
