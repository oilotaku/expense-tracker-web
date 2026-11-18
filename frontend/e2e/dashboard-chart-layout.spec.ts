import { expect, test, type Page } from '@playwright/test'

// e2e：總覽「支出分類」圓餅圖的版面（fixed.md §33）。所有 /api/v1 請求在瀏覽器端以假資料回應，
// 不登入、不寫入任何資料，可對任何環境執行。版面靠 container query，jsdom 量不到，所以放在 e2e。
// 情境：S-CHART-04（寬卡片圖例在圓餅右側、卡片底部不留大片空白）、S-CHART-05（窄卡片維持上下排）、
// S-CHART-06（寬卡片圖例列出全部分類、不顯示「其餘 N 類」；窄卡片仍折疊）。

const ok = (data: unknown): string => JSON.stringify({ success: true, data, detail: null, response_code: 200 })

const CATEGORIES = [
  ['媽', 10000], ['保險', 5000], ['柔', 4601], ['其他', 4500], ['餐飲', 2824],
  ['電信', 2399], ['社交', 1236], ['交通', 1200], ['娛樂', 200], ['購物', 50],
].map(([name, amount], index) => ({
  uid: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
  name: String(name),
  amount: Number(amount),
}))

const ACCOUNTS = ['現金', '台新 Richart', '中華郵政', 'LINE Bank', '玉山', '國泰世華'].map((name, index) => ({
  account_uid: `00000000-0000-4000-9000-0000000000${String(index).padStart(2, '0')}`,
  name,
  balance: String((index + 1) * 12345.5),
  currency: 'TWD',
  color: '#8B6ED6',
  icon: 'wallet',
}))

function mockResponses(): Record<string, string> {
  const today = new Date().toISOString().slice(0, 10)
  return {
    'auth/me': ok({ user_uid: 'u1', email: 'demo@example.com', has_pin: true, is_admin: false, must_change_password: false }),
    'dashboard/summary': ok({
      period: 'month', date_from: today, date_to: today,
      income: '52000.00', expense: '32010.00', balance: '19990.00', budget_remaining: '8000.00',
    }),
    'dashboard/category-breakdown': ok({ items: CATEGORIES.map((c) => ({ category_uid: c.uid, amount: String(c.amount) })) }),
    'dashboard/trend': ok({ items: [] }),
    'dashboard/exchange-rates': ok({ rates: {} }),
    categories: ok({
      items: CATEGORIES.map((c) => ({ category_uid: c.uid, name: c.name, color: '#8B6ED6', icon: 'other' })),
      total: CATEGORIES.length,
    }),
    accounts: ok({ items: ACCOUNTS, total: ACCOUNTS.length }),
    'net-worth': ok({
      total_assets: '1234567', total_liabilities: '300000', net_worth: '934567', accounts: [],
      assets: [{ financial_asset_uid: 'a1', asset_type: 'stock', name: '2330', market_value: '580000', principal_amount: '400000', gain_percent: '45.00' }],
    }),
  }
}

async function openDashboard(page: Page): Promise<void> {
  const responses = mockResponses()
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1\//, '')
    return route.fulfill({ status: 200, contentType: 'application/json', body: responses[path] ?? ok({ items: [], total: 0 }) })
  })
  await page.goto('/dashboard')
  await expect(page.getByRole('list', { name: '支出分類明細' })).toBeVisible()
  // recharts ResponsiveContainer 量完尺寸、切換動畫結束
  await page.waitForTimeout(1500)
}

interface ChartBoxes {
  pie: { left: number; right: number; top: number; bottom: number }
  legend: { left: number; right: number; top: number; bottom: number }
  emptyBottom: number
  cardPaddingBottom: number
}

async function measure(page: Page): Promise<ChartBoxes> {
  const card = page.locator('h2', { hasText: '支出分類' }).locator('xpath=..')
  return card.evaluate((el) => {
    const box = (node: Element | null): { left: number; right: number; top: number; bottom: number } => {
      const r = node?.getBoundingClientRect()
      return { left: r?.left ?? 0, right: r?.right ?? 0, top: r?.top ?? 0, bottom: r?.bottom ?? 0 }
    }
    const lastBottom = [...el.querySelectorAll('*')].reduce((max, node) => Math.max(max, node.getBoundingClientRect().bottom), 0)
    return {
      pie: box(el.querySelector('svg.recharts-surface')),
      legend: box(el.querySelector('ul[aria-label="支出分類明細"]')),
      emptyBottom: el.getBoundingClientRect().bottom - lastBottom,
      cardPaddingBottom: parseFloat(getComputedStyle(el).paddingBottom),
    }
  })
}

for (const width of [1280, 1920]) {
  test(`S-CHART-04 ${width} 桌機：圖例在圓餅右側，卡片底部只剩內距`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openDashboard(page)
    const boxes = await measure(page)
    expect(boxes.legend.left).toBeGreaterThanOrEqual(boxes.pie.right)
    expect(boxes.legend.top).toBeLessThan(boxes.pie.bottom)
    expect(boxes.emptyBottom).toBeLessThanOrEqual(boxes.cardPaddingBottom + 4)
  })
}

test('S-CHART-05 390 手機：窄卡片維持圓餅在上、圖例在下', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openDashboard(page)
  const boxes = await measure(page)
  expect(boxes.legend.top).toBeGreaterThanOrEqual(boxes.pie.bottom)
})

test('S-CHART-06 1280 桌機：圖例空間夠，列出第 9、10 類，不顯示「其餘 2 類」', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openDashboard(page)
  const legend = page.getByRole('list', { name: '支出分類明細' })
  await expect(legend.getByText('娛樂', { exact: true })).toBeVisible()
  await expect(legend.getByText('購物', { exact: true })).toBeVisible()
  await expect(legend.getByText('其餘 2 類')).toBeHidden()
  await expect(legend.getByRole('listitem')).toHaveCount(10)
})

test('S-CHART-06 390 手機：圖例橫向換行空間有限，仍折疊成「其餘 2 類」', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openDashboard(page)
  const legend = page.getByRole('list', { name: '支出分類明細' })
  await expect(legend.getByText('其餘 2 類')).toBeVisible()
  await expect(legend.getByText('娛樂', { exact: true })).toBeHidden()
  await expect(legend.getByRole('listitem')).toHaveCount(9)
})
