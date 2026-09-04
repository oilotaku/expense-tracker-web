---
id: task-010
title: 客製化數字鍵盤 NumericKeypad（含 PIN autofill 支援）
status: done
parallel: true
depends_on: [task-006, task-007]
affected_files:
  - frontend/src/components/common/NumericKeypad.tsx
  - frontend/src/components/common/NumericKeypad.test.tsx
estimated_hours: 5
rules: [rules/10-frontend/05-components.md, rules/10-frontend/06-rwd.md]
---
## 目標

`design-spec.md` §5 全節（含 2026-09-04 決議更新）：`mode="pin"` 底層原生 `<input type="password">` 改為**真實可見、非 `readOnly`**，`-webkit-text-security: disc` + 大 `letter-spacing` 呈現圓點視覺（**不**疊裝飾用圓點 `<div>`），`inputMode="numeric"` + `pattern="\d*"` + `maxLength={6}`；`autoComplete` 由呼叫端傳入（登入情境 `current-password`、設定/變更情境 `new-password`）。自訂鍵盤按鍵寫值用原生 setter（`Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set`）+ `dispatchEvent(new Event('input', {bubbles: true}))`，確保與瀏覽器 autofill 行為同步。`mode="amount"` 維持 `type="text"` + `readOnly` + `inputMode="none"`，不受影響。每鍵 `min-h-[44px] min-w-[44px]`（`→ FE-058`），PIN 錯誤 shake 動畫遵守 `useReducedMotion()`。

## Acceptance

- [x] `npm run test -- --run` 全綠，含：`mode="pin"` 輸入滿 6 碼自動送出、`mode="amount"` 需按「完成」、`mode="pin"` 的 input 非 `readOnly` 且可見（`toBeVisible()` + 無 `readOnly` attribute）、`autoComplete` prop 正確傳遞（`current-password`/`new-password` 兩種情境各一條測試）、密碼管理員模擬 autofill（直接 `fireEvent.input` 改變原生 value）能同步更新元件內部 state、`prefers-reduced-motion` 時錯誤回饋不做位移動畫
- [x] `npm run typecheck` 全綠
- [x] `npm run lint` 全綠
- [x] `npm run build` 成功

## 必讀檔（Just-in-time）

- rules/10-frontend/05-components.md
- rules/10-frontend/06-rwd.md
