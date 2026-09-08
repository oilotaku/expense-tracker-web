---
id: task-026
title: e2e：PIN 登入 / Dashboard 彙總 / 週期擴充 / 分類帳戶顏色 / Dark Mode
status: done
parallel: false
depends_on: [task-016, task-018, task-019, task-020, task-021, task-022]
affected_files:
  - frontend/e2e/pin-login.spec.ts
  - frontend/e2e/dashboard-summary.spec.ts
  - frontend/e2e/recurring-interval.spec.ts
  - frontend/e2e/category-account-color.spec.ts
  - frontend/e2e/dark-mode.spec.ts
estimated_hours: 6
rules: [rules/50-ci-cd/01-frontend-jobs.md, AGENTS.md § Testing]
---
## 目標

Playwright e2e 驗證本版對外承諾的手測項目：(1) 設定 PIN 後用 PIN 快速登入成功，連續輸入錯誤 5 次後第 6 次被鎖定 15 分鐘（可用時間注入/mock 縮短驗證等待）；(2) Dashboard 切換月/年/自訂範圍，數字改吃 `GET /dashboard/summary`（非前端分頁全抓）；(3) 新增一筆「每 2 週」與一筆「每年」的固定收支規則，清單正確顯示週期描述；(4) 新增分類/帳戶時自訂顏色與圖示，重新整理後仍保留；(5) 切換 Dark Mode 後頁面色彩改變且重新整理後偏好被記住。

## Acceptance

- [x] `npx playwright test frontend/e2e/pin-login.spec.ts` 通過
- [x] `npx playwright test frontend/e2e/dashboard-summary.spec.ts` 通過
- [x] `npx playwright test frontend/e2e/recurring-interval.spec.ts` 通過
- [x] `npx playwright test frontend/e2e/category-account-color.spec.ts` 通過
- [x] `npx playwright test frontend/e2e/dark-mode.spec.ts` 通過

## 必讀檔（Just-in-time）

- rules/50-ci-cd/01-frontend-jobs.md
- AGENTS.md § Testing

## 執行備註（task-026 worker）

- 5 支 spec 皆通過（`workers: 1`，`--output` 導到 `/tmp` 避免寫進 `docker compose watch` 監看的
  `frontend/` 觸發容器 rebuild）。本機執行需 `E2E_BASE_URL=http://<與 NEXT_PUBLIC_API_URL 同一個
  host>:3000`：登入是 httpOnly cookie，cookie 綁 host，頁面開在 `localhost:3000` 而 API 走
  LAN IP 時兩邊不共用 cookie。CI 的 `.env.development.example` 前後端都是 localhost，沿用預設即可。
- **跨 task 缺口（依 CORE-140 停手回報，未修）**：
  1. `POST /auth/login/pin` 的鎖定計數在正式路徑被 `app/api/deps.py::get_db` 的 `except:
     rollback()` 回捲，`pin_failed_attempts` 恆為 0，**PIN 連續失敗鎖定機制實質失效**
     （`→ design-spec §12.2` / `A15`）。`pin-login.spec.ts` 的鎖定 case 以 `test.fail()`
     標記為預期失敗並保留完整斷言，後端修好會因「意外通過」讓 CI 轉紅提醒移除該標記。
  2. `useDeviceAccounts.rememberAccount` 在正式程式碼從未被呼叫，`/login` 的「改用 PIN 快速
     登入」入口永遠不出現；`pin-login.spec.ts` 以測試 fixture 補寫 `device-accounts`。
  3. v1.0.0 遺留的 `e2e/multi-user-isolation.spec.ts` / `e2e/net-worth.spec.ts` 仍斷言登入後
     導向 `/transactions`（v1.1.0 已改為 `/dashboard`），兩支目前皆為紅燈；前者另外還會因
     `POST /accounts` 缺少 v1.1.0 新增的必填 `color` / `icon` 而 422。
  4. `docker-compose.yml` frontend 的 `develop.watch.ignore` 未排除 `test-results/` /
     `playwright-report/` / `e2e/`，本機跑 e2e 會即時觸發 frontend 容器 rebuild，造成
     `chrome-error://chromewebdata/` 型別的偶發紅燈。
