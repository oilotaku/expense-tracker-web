import { expect, test, type Page } from '@playwright/test'

// e2e：propose-v1.0.0.md 手測驗收項目 (2) ——「兩個不同帳號登入，看不到彼此的交易紀錄」。
// 對真實 backend / DB 跑（不 mock），驗證的是後端每筆查詢皆以當前登入使用者 user_uid 過濾
// （多租戶隔離），不是單純的前端顯示邏輯。

const API_BASE_URL = process.env.E2E_API_BASE_URL ?? 'http://localhost:8000/api/v1'

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

async function register(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '註冊' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '登入' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

// 交易表單要求選帳戶（→ TransactionForm.tsx），但本 task 的 affected_files 不含帳戶管理頁面
// （task-002 只做了後端 CRUD，尚無對應前端頁），所以直接呼叫既有的帳戶 API 建立一筆測試帳戶。
// 走 `page.request`（與 page 共用 browser context 的 cookie），沿用當前登入使用者的 session。
async function createAccountViaApi(page: Page, name: string): Promise<void> {
  const response = await page.request.post(`${API_BASE_URL}/accounts`, {
    data: { name, balance: '0', color: '#8B6ED6', icon: 'wallet' },
  })
  expect(response.ok()).toBeTruthy()
}

test('雙帳號隔離：使用者 B 看不到使用者 A 的交易紀錄', async ({ page, context }) => {
  const passwordA = 'e2e-isolation-password-a-1'
  const passwordB = 'e2e-isolation-password-b-1'
  const emailA = uniqueEmail('isolation-a')
  const emailB = uniqueEmail('isolation-b')
  const secretDescription = `userA-only-transaction-${Date.now()}-${Math.floor(Math.random() * 1e6)}`

  // 兩個帳號各自註冊（註冊不會設定登入 cookie，互不影響）
  await register(page, emailA, passwordA)
  await register(page, emailB, passwordB)

  // 以使用者 A 登入，建立一筆帳戶（分類已由後端 DB trigger 於註冊時種好預設值）與一筆交易
  await login(page, emailA, passwordA)
  await createAccountViaApi(page, 'A的帳戶')

  await page.goto('/transactions')
  // task-017（交易清單頁重做）已把新增交易表單改成 <TransactionFormDialog>（由「＋ 新增交易」按鈕
  // 觸發的 dialog），不再是頁面常駐 <form>；金額欄位也改用 <NumericKeypad>（readOnly input，靠點
  // 數字鍵輸入，不能 .fill()）。這是 task-032 拆解當下未預見、但同屬本檔 affected_files 範圍內需
  // 一併同步的互動細節。
  await page.getByRole('button', { name: '＋ 新增交易' }).click()
  const transactionDialog = page.getByRole('dialog')
  await transactionDialog.getByRole('radio', { name: '支出' }).click()
  await transactionDialog.getByLabel('分類').selectOption({ index: 1 })
  await transactionDialog.getByLabel('帳戶').selectOption({ index: 1 })
  await transactionDialog.getByLabel('明細').fill(secretDescription)
  for (const digit of '123') {
    await transactionDialog.getByRole('button', { name: `數字 ${digit}` }).click()
  }
  await transactionDialog.getByLabel('支付方式').fill('現金')
  await transactionDialog.getByRole('button', { name: '儲存' }).click()

  await expect(page.getByRole('cell', { name: secretDescription })).toBeVisible()

  // 清掉 cookie 模擬登出（backend 未提供 /auth/logout，→ authApi.ts），改用使用者 B 登入
  await context.clearCookies()
  await login(page, emailB, passwordB)

  await page.goto('/transactions')
  await expect(page.getByText('沒有符合條件的交易')).toBeVisible()
  await expect(page.getByRole('cell', { name: secretDescription })).toHaveCount(0)
})
