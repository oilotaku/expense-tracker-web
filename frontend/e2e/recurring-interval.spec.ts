import { expect, test, type Page } from '@playwright/test'

// e2e：propose-v1.1.0.md 對外承諾的手測項目 (3) ——「新增一筆『每 2 週』與一筆『每年』的固定收支
// 規則，清單正確顯示週期描述」。對真實 backend / DB 跑，不 mock 任何一層（→ AGENTS.md § Testing）。
//
// v1.0.0 的 `recurring_rules` 只支援「每月第 N 天」（單一 `day_of_month` 欄位）；v1.1.0 擴充成
// `interval_unit`（週/月/年）+ `interval_count`（1–99）+ `anchor_date`（design-spec §7.2 / §12.3
// / `→ A6` `→ A16`）。本 spec 走完整 UI 表單（不走 API 塞資料），確認新欄位確實有送到後端、
// 存得下來，並在清單以「每 2 週」/「每年」的描述文字回顯。

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

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

async function registerAndLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '註冊' }).click()
  // 註冊成功導向登入頁時會帶「註冊後首次登入」訊號（→ register/page.tsx），
  // 登入成功後由該訊號在 /dashboard 觸發一次性的 PIN 快速登入提醒
  await expect(page).toHaveURL(/\/login\?justRegistered=1$/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '登入' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

interface RecurringRuleFormValues {
  description: string
  amount: string
  intervalUnit: '週' | '月' | '年'
  intervalCount: string
  anchorDate: string
}

/** 走 `/recurring` 的「新增週期性交易規則」表單建立一筆規則（design-spec §7.2 / §9.5）。 */
async function submitRecurringRule(page: Page, values: RecurringRuleFormValues): Promise<void> {
  const form = page.locator('form')
  await form.getByLabel('分類').selectOption({ index: 1 })
  await form.getByLabel('帳戶').selectOption({ index: 1 })
  await form.getByLabel('說明').fill(values.description)
  await form.getByLabel('金額').fill(values.amount)
  await form.getByLabel('支付方式').fill('現金')
  await form.getByLabel('週期單位').selectOption({ label: values.intervalUnit })
  // 「每幾個X執行一次（1–99）」的 X 隨週期單位變動，用 regex 而非固定字串比對
  await form.getByLabel(/每幾個.*執行一次/).fill(values.intervalCount)
  await form.getByLabel('起算日').fill(values.anchorDate)

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/recurring-rules') && response.request().method() === 'POST',
  )
  await form.getByRole('button', { name: '新增規則' }).click()
  expect((await createResponse).status()).toBe(201)
}

test('新增「每 2 週」與「每年」規則，清單顯示對應週期描述', async ({ page }) => {
  test.setTimeout(180_000)

  const email = uniqueEmail('recurring')
  await registerAndLogin(page, email, 'e2e-recurring-password-1')

  // 規則表單要求選帳戶，新註冊使用者沒有任何帳戶（分類則由 DB trigger 種好），
  // 先用既有帳戶 API 建一筆（同 multi-user-isolation.spec.ts 既有慣例）。
  const accountResponse = await page.request.post(`${API_BASE_URL}/accounts`, {
    data: { name: 'e2e 週期帳戶', balance: '0', color: '#8B6ED6', icon: 'wallet' },
  })
  expect(accountResponse.ok()).toBeTruthy()

  await page.goto('/recurring')
  await expect(page.getByText('尚未設定任何週期性交易規則')).toBeVisible()

  const biweeklyDescription = `e2e 每兩週訂閱 ${Date.now()}`
  await submitRecurringRule(page, {
    description: biweeklyDescription,
    amount: '120',
    intervalUnit: '週',
    intervalCount: '2',
    anchorDate: '2026-01-05',
  })

  const yearlyDescription = `e2e 每年保費 ${Date.now()}`
  await submitRecurringRule(page, {
    description: yearlyDescription,
    amount: '9600',
    intervalUnit: '年',
    intervalCount: '1',
    anchorDate: '2026-03-01',
  })

  // 週期描述由 interval_unit + interval_count 組合（→ recurring/page.tsx intervalDescription）：
  // count > 1 → 「每 N 單位」；count === 1 → 「每單位」（month 另外附上 anchor_date 的日部分）
  const biweeklyCard = page.locator('li').filter({ hasText: biweeklyDescription })
  await expect(biweeklyCard).toHaveCount(1)
  await expect(biweeklyCard.getByText('每 2 週', { exact: true })).toBeVisible()

  const yearlyCard = page.locator('li').filter({ hasText: yearlyDescription })
  await expect(yearlyCard).toHaveCount(1)
  await expect(yearlyCard.getByText('每年', { exact: true })).toBeVisible()

  // 重新整理後仍由後端讀回同樣的週期描述（確認 interval_unit / interval_count 真的落地，
  // 不是只活在剛剛那次 mutation 的前端回應裡）
  await page.reload()
  await expect(
    page.locator('li').filter({ hasText: biweeklyDescription }).getByText('每 2 週', { exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('li').filter({ hasText: yearlyDescription }).getByText('每年', { exact: true }),
  ).toBeVisible()
})
