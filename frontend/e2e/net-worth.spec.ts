import { expect, test, type Page } from '@playwright/test'

// e2e：propose-v1.0.0.md 手測驗收項目 (1) ——「新增一筆股票資產後，dashboard 總資產反映當前
// 抓到的市價」。對真實 backend / DB / 外部報價來源（TWSE MIS，→
// docs/Arch/adr/0001-stock-price-source.md）跑，不 mock 任何一層（→ AGENTS.md § Testing）。
//
// 股號固定用 `2330`（台積電）：ADR-0001 spike 已用此股號實測驗證過 TWSE MIS 端點涵蓋範圍，
// 確保測試不會因為股號本身查無資料而假性失敗。

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://localhost:8000/api/v1'
const STOCK_TICKER = '2330'

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

async function registerAndLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '註冊' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '登入' }).click()
  await expect(page).toHaveURL(/\/transactions$/)
}

// GET /net-worth 在上游報價來源暫時不可用時回 424（→ net_worth_service.py
// NetWorthPricingUnavailableError），dashboard 顯示可重試的提示（→ dashboard/page.tsx）。
// 這裡在輪詢過程中順手點擊「重試」，讓測試對外部服務單次抖動有一定容忍度，
// 而不是把外部服務的暫時性錯誤誤判為本頁功能壞掉。
async function pollTotalAssets(
  page: Page,
  predicate: (value: number) => boolean,
): Promise<number> {
  let lastValue: number | null = null
  await expect
    .poll(
      async () => {
        const retryButton = page.getByRole('button', { name: '重試' })
        if (await retryButton.isVisible().catch(() => false)) {
          await retryButton.click()
        }
        // 用 `text-gray-600` 鎖定卡片標籤本身，不會誤配到 424 錯誤提示（該段文字含「總資產」
        // 子字串，但用的是 `text-red-600`，→ dashboard/page.tsx isPricingUnavailable 分支）。
        const valueLocator = page
          .locator('p.text-sm.text-gray-600', { hasText: '總資產' })
          .locator('xpath=following-sibling::p[1]')
        if (!(await valueLocator.isVisible().catch(() => false))) return false
        const text = await valueLocator.innerText()
        const value = Number(text)
        if (Number.isNaN(value)) return false
        lastValue = value
        return predicate(value)
      },
      { timeout: 30_000, message: '總資產數值未如預期出現 / 更新' },
    )
    .toBe(true)
  return lastValue as unknown as number
}

test('新增股票資產後，dashboard 總資產反映抓到的市價', async ({ page }) => {
  const email = uniqueEmail('networth')
  const password = 'e2e-networth-password-1'

  await registerAndLogin(page, email, password)

  // 尚未新增任何金融資產 / 帳戶，總資產應為 0
  await page.goto('/dashboard')
  const totalAssetsBefore = await pollTotalAssets(page, () => true)
  expect(totalAssetsBefore).toBe(0)

  // 新增一筆股票資產（10 股 2330）
  await page.goto('/assets')
  const stockForm = page.locator('form').filter({ hasText: '新增股票持股' })
  await stockForm.getByLabel('股票代號 / 名稱').fill(STOCK_TICKER)
  await stockForm.getByLabel('數量').fill('10')
  await stockForm.getByLabel('單位').selectOption('股')
  await stockForm.getByRole('button', { name: '新增股票' }).click()

  await expect(page.getByRole('cell', { name: STOCK_TICKER })).toBeVisible()

  // 直接呼叫後端 API 取得權威計算結果（會觸發並快取一次真實的 TWSE MIS 報價查詢），
  // 用來驗證 UI 顯示的數字「確實反映抓到的市價」，而不是隨便一個非零數字就放行。
  const netWorthResponse = await page.request.get(`${API_BASE_URL}/net-worth`)
  expect(netWorthResponse.ok()).toBeTruthy()
  const netWorthBody = (await netWorthResponse.json()) as { data: { total_assets: string } }
  const expectedTotalAssets = Number(netWorthBody.data.total_assets)
  expect(expectedTotalAssets).toBeGreaterThan(0)

  await page.goto('/dashboard')
  const totalAssetsAfter = await pollTotalAssets(page, (value) => value === expectedTotalAssets)

  expect(totalAssetsAfter).toBeGreaterThan(totalAssetsBefore)
  expect(totalAssetsAfter).toBe(expectedTotalAssets)
})
