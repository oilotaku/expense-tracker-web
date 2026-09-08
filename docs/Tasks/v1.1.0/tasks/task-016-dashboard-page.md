---
id: task-016
title: Dashboard 頁面重做（桌機 + 行動版）
status: done
parallel: true
depends_on: [task-007, task-008, task-009, task-012, task-013, task-015]
affected_files:
  - frontend/src/app/dashboard/page.tsx
  - frontend/src/app/dashboard/page.test.tsx
  - frontend/src/components/dashboard/PeriodSelector.tsx
  - frontend/src/components/dashboard/PeriodSelector.test.tsx
  - frontend/src/components/dashboard/StatTile.tsx
  - frontend/src/components/dashboard/StatTile.test.tsx
  - frontend/src/components/dashboard/NetWorthCard.tsx
  - frontend/src/components/dashboard/NetWorthCard.test.tsx
estimated_hours: 8
rules: [rules/10-frontend/05-components.md, rules/10-frontend/06-rwd.md, rules/00-core/03-timezone.md]
---
## 目標

`design-spec.md` §9.2：Dashboard 用 `<AppShell>`（task-009）包裹，`<PeriodSelector>`（月/年/自訂範圍）驅動 task-013 的 `useGetDashboardSummaryQuery`；四張 `<StatTile>`（月收入/月支出/結餘/預算結餘，`period != month` 時預算結餘顯示簡化灰階狀態，`→ A7`）；`<NetWorthCard>` 沿用既有 `useGetNetWorthQuery` 邏輯改視覺（原本內嵌於 `dashboard/page.tsx` 的 `NetWorthCard` 抽成獨立元件）；圖表區用 task-012 元件；帳戶總覽卡（沿用既有帳戶清單 API，`→ A4` 漸進揭露）；最近交易摘要（`GET /transactions?limit=5`）；FAB／「＋新增交易」開 task-015 的 `<TransactionFormDialog>`。桌機 `grid-cols-4`、行動端結餘 Hero 拉大（`→ §9.2` RWD 對應）。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：`PeriodSelector` 切換觸發重新查詢、`period=year`/`custom` 時預算結餘卡顯示「預算僅支援月度檢視」、FAB 開啟 `TransactionFormDialog`、`useGetNetWorthQuery` 424（報價來源不可用）時顯示可重試提示（沿用既有邏輯）
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
- rules/10-frontend/06-rwd.md
- rules/00-core/03-timezone.md
