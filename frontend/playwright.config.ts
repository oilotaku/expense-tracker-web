import { defineConfig } from '@playwright/test'

// e2e 對象是完整 stack（真實瀏覽器 + 真實 backend + 真實 DB + 真實外部報價來源），不 mock 任何一層
// （→ AGENTS.md § Testing；task-018）。stack 由 docker compose 另外啟動（本機 `/start-dev`，CI
// 見 `.github/workflows/e2e.yml`），本設定**不**含 `webServer`：避免 Playwright 自己另啟一份
// `next dev`（禁宿主機直接跑 `next dev`，→ AGENTS.md § Local Dev）。
//
// `workers: 1`：兩支 spec 都會觸發 GET /net-worth → 呼叫 TWSE MIS（ADR-0001 記載約 1 req/2s
// 的社群觀察限速）與 Redis 快取寫入，序列跑避免同時觸發限速或快取競態，非效能考量。
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 1, // → CICD-015：同一 case 連 2 次才視為 flaky，本設定不重試到綠
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
})
