---
id: task-032
title: 修正 2 支 v1.0.0 e2e 因 v1.1.0 改動而變紅（登入導向 /dashboard、帳戶新增必填 color/icon）
status: done
parallel: true
depends_on: []
affected_files:
  - frontend/e2e/multi-user-isolation.spec.ts
  - frontend/e2e/net-worth.spec.ts
estimated_hours: 1
rules: []
---

> 來源：task-026 e2e 執行中發現（CORE-068，CI 的 e2e job 目前必紅，需修正才能視為本版可過 PR gate）。

## 目標

兩支 v1.0.0 既有 e2e（`docs/Tasks/v1.0.0/tasks/task-018-e2e.md` 產出）因本版改動而斷：

1. **登入後導向目標改變**：`frontend/e2e/multi-user-isolation.spec.ts:26`、`frontend/e2e/net-worth.spec.ts:27` 皆斷言 `await expect(page).toHaveURL(/\/transactions$/)`，但 task-018（登入頁重做）已把登入成功後的導向從 `/transactions` 改成 `/dashboard`（對齊 v1.1.0 IA，Dashboard 為根節點，`→ design-spec.md §3`）。改成 `/dashboard$/`。
2. **帳戶建立必填欄位變更**：`frontend/e2e/multi-user-isolation.spec.ts` 第 33 行附近的 `createAccountViaApi()` 呼叫 `POST /accounts` 只帶 `{ name, balance: '0' }`，task-005 已讓 `color`/`icon` 變成必填（同 `fixed.md` §7 根因），需要補上這兩個欄位（例如 `color: '#8B6ED6', icon: 'wallet'`，比照其他測試檔的做法）。

`multi-user-isolation.spec.ts` 內另外兩處 `page.goto('/transactions')`（第 54、69 行）**不用改**——那是測試主動導覽到交易頁去驗證資料隔離，不是登入後的預設導向斷言，`/transactions` 路由本身沒有被移除。

## Acceptance

- [x] `npx playwright test frontend/e2e/multi-user-isolation.spec.ts` 通過
- [x] `npx playwright test frontend/e2e/net-worth.spec.ts` 通過（首次同步驗證卡在台股未開盤 424，09:05 CST 開盤後重跑一次通過，見下方備註）
- [x] `git status --porcelain` 只多出本 task 的 2 個 `affected_files`

## 必讀檔（Just-in-time）

- `docs/Tasks/v1.1.0/design-spec.md` §3（IA：Dashboard 為根節點）
- `docs/Tasks/v1.1.0/fixed.md` §7（color/icon 必填的根因，理解為什麼要補這兩個欄位）

## Worker 備註（2026-09-09，執行中發現超出原始「目標」描述的 2 個額外斷點）

實際同步跑測試才發現，原「目標」列的兩項改完後仍紅，追查後定位到兩個本 task 拆解當下未預見、但落在本檔 `affected_files` 範圍內、需一併修的既有 e2e 互動細節：

1. **`multi-user-isolation.spec.ts`**：task-017（交易清單頁重做，done）已把新增交易表單從頁面常駐 `<form>` 改成 `<TransactionFormDialog>`（由「＋ 新增交易」按鈕觸發），金額欄位也改用 `<NumericKeypad>`（readOnly input，需點數字鍵而非 `.fill()`）。已同步改成先開 dialog、在 `getByRole('dialog')` 範圍內操作、金額改點擊「數字 N」按鈕。**已驗證：整支測試同步跑過，綠燈。**
2. **`net-worth.spec.ts`**：task-016（Dashboard 重做，done）把「總資產」從 `<p class="text-gray-600">` 改成 `<NetWorthCard>`/`<NetWorthRow>` 的一對 `<span>`（`text-text-secondary` 標籤 + 緊鄰的格式化數值 `span`，經 `formatAmount` 變成「NT$1,234」千分位字串），原本的 CSS class 選擇器完全選不到元素，數值也不能直接 `Number()` 轉換。已同步改成用 `getByText('總資產', { exact: true })` + `xpath=following-sibling::span[1]`，數值先 strip 非數字字元再轉換；並讓比對邏輯改用 `Math.round()` 對齊 UI 的 `maximumFractionDigits: 0` 四捨五入顯示（原本要求逐位元相等，股價乘股數不保證整數，會被 UI 四捨五入吃掉小數）。

**net-worth.spec.ts 目前卡住的原因（非程式問題）**：本機/容器時間為 2026-09-09 08:07 CST，直接 curl 台灣證交所 MIS 端點（`mis.twse.com.tw`）確認 `z`（成交價）欄位為 `"-"`、`a`/`b`（買賣報價）欄位皆缺席，屬於**開盤前（09:00 CST 開盤）** 的正常現象，`backend/app/clients/stock_price_client.py` 依規格對此正確回 424（`NetWorthPricingUnavailableError`），前端也正確顯示可重試提示——這是 ADR-0001 記載的真實外部依賴限制，不是本 task 或 v1.1.0 任何程式碼的缺陷。已用 curl 直接打後端 `/financial-assets` + `/net-worth` 複現同樣的 424，排除是 UI 互動寫錯的可能。

**後續（2026-09-09 09:05 CST）**：協調者確認台股應已開盤，同步重新跑 `npx playwright test frontend/e2e/net-worth.spec.ts`，curl 直打 TWSE MIS 確認 `a`/`b`（買賣報價）欄位已出現，重跑一次即通過（10.5s，1 passed）。程式碼本身未再改動——上一輪的邏輯修正（`getByText('總資產', { exact: true })` locator + `Math.round()` 比對）就是最終版本。已 commit（`f92cecd`），任務標記 done。
