---
id: task-022
title: 週期性交易頁視覺重做 + 週/年前端串接
status: done
parallel: true
depends_on: [task-009, task-003]
affected_files:
  - frontend/src/app/recurring/page.tsx
  - frontend/src/app/recurring/page.test.tsx
  - frontend/src/lib/api/recurringApi.ts
estimated_hours: 4
rules: [rules/10-frontend/02-api-and-state.md, rules/10-frontend/05-components.md]
---
## 目標

`design-spec.md` §9.5/§12.3：`/recurring` 頁沿用既有資料與互動邏輯，只做視覺重新套用（`<CurvedCard>` task-009、新 `cva` variant 按鈕、§2.3 語意色）；`recurringApi.ts` 型別擴充納入 task-003 新增的 `interval_unit`/`interval_count`/`anchor_date` 欄位，清單顯示新格式的週期描述（例：「每 2 週」「每年」）。

## Acceptance

- [ ] `npm run test -- --run` 全綠，含：清單正確顯示 `interval_unit`/`interval_count` 組合出的週期描述文字、既有月規則資料（`interval_unit=month, interval_count=1`）顯示與升級前一致的語意
- [ ] `npm run typecheck` 全綠
- [ ] `npm run lint` 全綠
- [ ] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/02-api-and-state.md
- rules/10-frontend/05-components.md
