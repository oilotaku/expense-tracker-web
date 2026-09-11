---
id: task-036
title: 帳戶編輯畫面新增直接編輯餘額功能
status: done
parallel: true
depends_on: []
affected_files:
  - frontend/src/components/accounts/AccountCard.tsx
  - frontend/src/components/accounts/AccountCard.test.tsx
  - frontend/src/app/accounts/page.tsx
  - frontend/src/app/accounts/page.test.tsx
estimated_hours: 2
rules: []
---

> 來源：使用者請求「增加直接編輯帳戶餘額功能」（CORE-068 拆補洞 task，新編號不覆寫既有 task）。後端 `AccountUpdateRequest.balance`（`backend/app/schemas/account.py`）與前端 `AccountUpdateRequest` 型別（`frontend/src/lib/api/accountsApi.ts`）皆早已支援這個欄位（`account_repository.py::update_fields` 直接覆寫 `account.balance`，無其他 side effect），但從沒有任何 UI 呼叫過——帳戶餘額原本只能在建立帳戶時設定，建立後只能靠交易間接調整，沒有地方能手動對帳／修正誤差。

## 目標

`AccountCard.tsx` 的編輯區塊比照既有「名稱」欄位的 draft + blur/Enter 提交慣例，新增「餘額」輸入框（`type="number" step="0.01"`，同 `AccountCreateDialog` 起始餘額欄位樣式，但額外允許負數如信用卡循環未繳，格式驗證用 `BALANCE_PATTERN = /^-?\d+(\.\d*)?$/`）。`app/accounts/page.tsx` 的 `commitAccountUpdate` patch 型別與 `<AccountCard>` 呼叫點一併加上 `balance`/`onBalanceChange`。不改動後端（schema/repository 本來就支援）。

## Acceptance

- [x] 帳戶卡片點擊編輯後可看到「餘額」輸入框，修改後 blur 或按 Enter 呼叫 `onBalanceChange(accountUid, balance)`
- [x] 餘額可改成負數；跟現值相同或格式不合法（非數字）時不提交
- [x] `docker run node:24-alpine ... npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全綠，含新增的 `AccountCard.test.tsx`／`accounts/page.test.tsx` 測試案例
- [x] `git status --porcelain` 只多出本 task 的 4 個 `affected_files`

## 必讀檔（Just-in-time）

- `backend/app/schemas/account.py`（`AccountUpdateRequest.balance` 既有定義，確認後端無需改動）
- `frontend/src/app/accounts/page.tsx`（既有「改名/改色/改圖示」的 `commitAccountUpdate` 慣例）
