---
id: task-040
title: 修正負值金額（-NT$...）被瀏覽器單獨斷成一行、desktop 結餘卡超出邊界
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

> 來源：使用者截圖回報 Dashboard「結餘」卡片格式跑掉（CORE-068 拆補洞 task，新編號不覆寫既有 task）。分兩輪修正，詳細根因見 `fixed.md` §17（斷行）與 §18（第一輪修正後暴露的超出邊界）。

## 目標

**第一輪**（§17）：`StatTile.tsx`／`dashboard/page.tsx`／`NetWorthCard.tsx` 三處組出「符號 + NT$ + 千分位數字」字串的容器都加上 `whitespace-nowrap`，避免瀏覽器把負號單獨斷成一行（Unicode UAX#14「連字號後接字母視為合法斷行點」）。

**第二輪**（§18）：第一輪上線後，使用者截圖回報 desktop 結餘卡文字改成超出卡片邊界（禁止換行後，原本放不下的文字從「醜但留在版面內換行」變成「直接溢出」）。根因是 `StatTile.tsx` 的 `hero` variant 在 `lg:` 起用比其他卡更大一級的字級（`text-4xl` vs `text-3xl`），但此時結餘卡已經跟其他卡等寬（`lg:col-span-1`），字級與欄寬不成比例。修正：`hero` 的 `lg:` 字級改回 `text-3xl`（與其他卡一致），只保留 mobile 的放大（此時仍有 `col-span-2` 雙倍寬撐得住）。

## Acceptance

- [x] `StatTile` 負值 + `hero` 情境的金額文字有 `whitespace-nowrap` class（新增測試驗證）
- [x] `StatTile` 的 `hero` variant 在 `lg:` 起字級與其他（非 hero）卡一致（`lg:text-3xl`），不再用 `lg:text-4xl`（更新既有測試斷言）
- [x] `docker run node:24-alpine ... npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全綠
- [x] `git status --porcelain` 只多出本 task 的 4 個 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/fixed.md` §17（斷行根因與三個受影響位置）、§18（超出邊界的追加根因）
