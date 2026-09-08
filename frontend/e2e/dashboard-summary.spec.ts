import { expect, test, type Locator, type Page } from '@playwright/test'

// e2e：propose-v1.1.0.md 對外承諾的手測項目 (2) ——「Dashboard 切換月 / 年 / 自訂範圍，數字改吃
// `GET /dashboard/summary`（非前端把交易分頁全抓回來自己加總）」。對真實 backend / DB 跑，不 mock
// 任何一層（→ AGENTS.md § Testing）。
//
// 驗證方式刻意不只看「數字有變」：每次切換期間都攔截對應的 `GET /api/v1/dashboard/summary`
// 回應，斷言畫面上的四張卡片就是「那一次回應」的內容（`→ design-spec.md §9.2 / §12.1 / A14`）。
// 只比對畫面數字的話，前端就算改成自行加總 `GET /transactions` 也可能湊出同樣的值，測不到
// 「資料源真的換成彙總 API」這件事。

const YEAR = String(new Date().getFullYear() - 1)
const EXPENSE_MARCH = '1000.00'
const EXPENSE_JULY = '250.00'
const INCOME_MARCH = '5000.00'

/**
 * e2e 的 API 呼叫必須打「與頁面同 host」的後端：登入用的是 httpOnly cookie，cookie 綁在 host 上。
 * 預設沿用既有 spec 的 `localhost`（CI 的 `.env.development.example` 兩邊都是 localhost），
 * 本機若把 `NEXT_PUBLIC_API_URL` 設成 LAN IP，就用 `E2E_BASE_URL` 一起指向同一個 host。
 */
function resolveApiBaseUrl(): string {
  const explicit = process.env.E2E_API_BASE_URL
  if (explicit) return explicit
  const base = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000')
  return `${base.protocol}//${base.hostname}:8000/api/v1`
}

const API_BASE_URL = resolveApiBaseUrl()

interface SummaryPayload {
  period: string
  income: string
  expense: string
  balance: string
  budget_remaining: string | null
}

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

/**
 * 以 API 完成「註冊 + 登入 + 建一個帳戶 + 建兩筆不同月份的交易」的前置資料。
 * `page.request` 與瀏覽器共用同一份 cookie jar，登入後頁面即為已登入狀態（同
 * multi-user-isolation.spec.ts 既有慣例）。本 spec 要驗的是 Dashboard 的期間彙總行為，
 * 建資料本身不是待驗行為，走 API 以免把整條註冊/建檔 UI 流程重複測一遍。
 */
async function seedFixtures(page: Page): Promise<void> {
  const email = uniqueEmail('dashboard')
  const password = 'e2e-dashboard-password-1'

  const registerResponse = await page.request.post(`${API_BASE_URL}/auth/register`, {
    data: { email, password },
  })
  expect(registerResponse.ok()).toBeTruthy()
  const loginResponse = await page.request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  })
  expect(loginResponse.ok()).toBeTruthy()

  const accountResponse = await page.request.post(`${API_BASE_URL}/accounts`, {
    data: { name: 'e2e 現金', balance: '0', color: '#8B6ED6', icon: 'wallet' },
  })
  expect(accountResponse.ok()).toBeTruthy()
  const accountUid = ((await accountResponse.json()) as { data: { account_uid: string } }).data
    .account_uid

  // 分類由後端 DB trigger 於註冊時種好預設值（→ multi-user-isolation.spec.ts 同註解）
  const categoriesResponse = await page.request.get(`${API_BASE_URL}/categories`)
  expect(categoriesResponse.ok()).toBeTruthy()
  const categories = ((await categoriesResponse.json()) as {
    data: { items: { category_uid: string }[] }
  }).data.items
  const categoryUid = categories[0]?.category_uid
  expect(categoryUid).toBeTruthy()

  // 去年的固定日期：與「今天」無關，不論在哪個月跑，月 / 年 / 自訂三種期間的涵蓋範圍都固定
  const transactions = [
    { date: `${YEAR}-03-15T12:00:00+08:00`, amount: EXPENSE_MARCH, type: 'expense' },
    { date: `${YEAR}-03-15T12:00:00+08:00`, amount: INCOME_MARCH, type: 'income' },
    { date: `${YEAR}-07-20T12:00:00+08:00`, amount: EXPENSE_JULY, type: 'expense' },
  ]
  for (const transaction of transactions) {
    const response = await page.request.post(`${API_BASE_URL}/transactions`, {
      data: {
        account_uid: accountUid,
        category_uid: categoryUid,
        transaction_date: transaction.date,
        description: `e2e ${transaction.type} ${transaction.date.slice(0, 10)}`,
        amount: transaction.amount,
        transaction_type: transaction.type,
        payment_method: '現金',
      },
    })
    expect(response.ok()).toBeTruthy()
  }
}

/** 期間彙總四張卡片：標籤 `<p>` 的下一個 `<p>` 即數值（→ StatTile.tsx）。 */
function statValue(page: Page, label: string): Locator {
  return page
    .locator('section[aria-label="期間彙總"] p')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::p[1]')
}

/**
 * 等待「符合指定日期範圍」的那一次 `GET /dashboard/summary` 回應並回傳其內容。
 * 用 `date_from` / `date_to` 而非只用 `period` 當條件：切到「自訂範圍」時會先帶預設起訖日發一次，
 * 再隨兩個日期輸入各發一次，只認 period 會抓到中途那幾次。
 */
function waitForSummary(page: Page, dateFromPrefix: string, dateToPrefix: string): Promise<SummaryPayload> {
  return page
    .waitForResponse((response) => {
      if (!response.url().includes('/dashboard/summary') || !response.ok()) return false
      const params = new URL(response.url()).searchParams
      return (
        (params.get('date_from') ?? '').startsWith(dateFromPrefix) &&
        (params.get('date_to') ?? '').startsWith(dateToPrefix)
      )
    })
    .then(async (response) => ((await response.json()) as { data: SummaryPayload }).data)
}

// StatTile.formatAmount 的顯示格式（`NT$1,000` / `+NT$3,750` / `-NT$250`），在測試端獨立算一次，
// 用來確認畫面上的字串確實由「該次 summary 回應」推導而來，而不是恰好長得像。
function formatAmount(value: string, signed = false): string {
  const amount = Number(value)
  const absolute = Math.abs(amount).toLocaleString('zh-Hant-TW', { maximumFractionDigits: 0 })
  const sign = amount < 0 ? '-' : signed && amount > 0 ? '+' : ''
  return `${sign}NT$${absolute}`
}

async function expectTilesMatch(page: Page, summary: SummaryPayload): Promise<void> {
  await expect(statValue(page, '收入')).toHaveText(formatAmount(summary.income))
  await expect(statValue(page, '支出')).toHaveText(formatAmount(summary.expense))
  await expect(statValue(page, '結餘')).toHaveText(formatAmount(summary.balance, true))
}

test('Dashboard 切換月 / 年 / 自訂範圍，四張卡片改吃 GET /dashboard/summary', async ({ page }) => {
  test.setTimeout(180_000)

  await seedFixtures(page)

  // 期間下拉：不用 getByLabel('期間')——`<label>` 的文字內容是「期間」+ 所有 option 文字串起來，
  // 且 `<section aria-label="期間彙總">` 也含「期間」子字串，會撞 strict mode。改用 Header 內
  // 唯一的 `<select>`（PeriodSelector 常駐於 Header，→ dashboard/page.tsx）。
  const periodSelect = page.locator('header select')

  // (1) 月：只涵蓋 3 月的兩筆
  const marchSummaryPromise = waitForSummary(page, `${YEAR}-03-01`, `${YEAR}-03-31`)
  await page.goto('/dashboard')
  await page.getByLabel('月份').fill(`${YEAR}-03`)
  const marchSummary = await marchSummaryPromise

  expect(marchSummary.period).toBe('month')
  expect(Number(marchSummary.income)).toBe(Number(INCOME_MARCH))
  expect(Number(marchSummary.expense)).toBe(Number(EXPENSE_MARCH))
  await expectTilesMatch(page, marchSummary)
  await expect(statValue(page, '支出')).toHaveText('NT$1,000')
  // period === 'month' 時預算結餘可用（未設任何月度預算 → "0.00"，非 null，→ A7）
  expect(marchSummary.budget_remaining).not.toBeNull()
  await expect(statValue(page, '預算結餘')).toHaveText('NT$0')

  // (2) 年：同時涵蓋 3 月與 7 月
  const yearSummaryPromise = waitForSummary(page, `${YEAR}-01-01`, `${YEAR}-12-31`)
  await periodSelect.selectOption('year')
  await page.getByLabel('年份').fill(YEAR)
  const yearSummary = await yearSummaryPromise

  expect(yearSummary.period).toBe('year')
  expect(Number(yearSummary.expense)).toBe(Number(EXPENSE_MARCH) + Number(EXPENSE_JULY))
  await expectTilesMatch(page, yearSummary)
  await expect(statValue(page, '支出')).toHaveText('NT$1,250')
  // period !== 'month' 時後端一律回 null，卡片改顯示灰階「—」（→ A7）
  expect(yearSummary.budget_remaining).toBeNull()
  await expect(statValue(page, '預算結餘')).toHaveText('—')

  // (3) 自訂範圍：只涵蓋 7 月那筆
  const customSummaryPromise = waitForSummary(page, `${YEAR}-07-01`, `${YEAR}-07-31`)
  await periodSelect.selectOption('custom')
  await page.getByLabel('起始日期').fill(`${YEAR}-07-01`)
  await page.getByLabel('結束日期').fill(`${YEAR}-07-31`)
  const customSummary = await customSummaryPromise

  expect(customSummary.period).toBe('custom')
  expect(Number(customSummary.income)).toBe(0)
  expect(Number(customSummary.expense)).toBe(Number(EXPENSE_JULY))
  await expectTilesMatch(page, customSummary)
  await expect(statValue(page, '支出')).toHaveText('NT$250')
  await expect(statValue(page, '預算結餘')).toHaveText('—')
})
