---
id: task-040
title: 修正負值金額（-NT$...）被瀏覽器單獨斷成一行
status: done
parallel: true
depends_on: []
affected_files:
  - frontend/src/components/dashboard/StatTile.tsx
  - frontend/src/components/dashboard/StatTile.test.tsx
  - frontend/src/app/dashboard/page.tsx
  - frontend/src/components/dashboard/NetWorthCard.tsx
estimated_hours: 1
rules: []
---

> 來源：使用者截圖回報 Dashboard「結餘」卡片格式跑掉（CORE-068 拆補洞 task，新編號不覆寫既有 task）。詳細根因見 `fixed.md` §17。

## 目標

`StatTile.tsx`／`dashboard/page.tsx`／`NetWorthCard.tsx` 三處組出「符號 + NT$ + 千分位數字」字串的容器都加上 `whitespace-nowrap`，避免瀏覽器把負號單獨斷成一行（Unicode UAX#14「連字號後接字母視為合法斷行點」）。

## Acceptance

- [x] `StatTile` 負值 + `hero` 情境的金額文字有 `whitespace-nowrap` class（新增測試驗證）
- [x] `docker run node:24-alpine ... npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全綠
- [x] `git status --porcelain` 只多出本 task 的 4 個 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/fixed.md` §17（完整根因與三個受影響位置說明）
