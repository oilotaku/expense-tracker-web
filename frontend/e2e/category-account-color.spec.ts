import { expect, test, type Locator, type Page } from '@playwright/test'

// e2e：propose-v1.1.0.md 對外承諾的手測項目 (4) ——「新增分類 / 帳戶時自訂顏色與圖示，重新整理
// 頁面後仍保留」。對真實 backend / DB 跑，不 mock 任何一層（→ AGENTS.md § Testing）。
//
// 重點在「**重新整理後**仍保留」：v1.1.0 之前顏色是前端依名稱雜湊算出來的（不落地），本版把
// `color` / `icon` 加成 `categories` / `accounts` 的真實欄位（design-spec §12.4 / `→ A8`）。
// 因此本 spec 一律在 `page.reload()` 之後才做斷言 —— reload 會清掉所有前端 state 與 RTK Query
// 快取，畫面上還在的顏色/圖示只可能來自後端回應。

// 固定色票（design-spec §2.3 圖表 8 色）中刻意挑「非預設值」的兩個：分類與帳戶表單的預設色都是
// CHART_SWATCH_COLORS[0]（#8B6ED6），選別的顏色才驗得到「使用者的選擇有被存下來」。
const CATEGORY_COLOR = '#E8834B'
const CATEGORY_COLOR_RGB = 'rgb(232, 131, 75)'
const CATEGORY_ICON_LABEL = '餐飲'
const ACCOUNT_COLOR = '#2FA98A'
const ACCOUNT_COLOR_RGB = 'rgb(47, 169, 138)'
const ACCOUNT_ICON_LABEL = '銀行'

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

// 圖示按鈕的 aria-label 就是圖示中文名（如「餐飲」），而卡片上的編輯/刪除按鈕是「編輯 餐飲」/
// 「刪除 餐飲」——`getByRole` 的 name 預設是子字串比對，不加 exact 會一次命中三顆。
function iconButton(scope: Page | Locator, label: string): Locator {
  return scope.getByRole('button', { name: label, exact: true })
}

async function backgroundColorOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => window.getComputedStyle(element).backgroundColor)
}

test('新增分類時自訂顏色與圖示，重新整理後仍保留', async ({ page }) => {
  test.setTimeout(180_000)

  await registerAndLogin(page, uniqueEmail('category-color'), 'e2e-category-password-1')

  const categoryName = `e2e分類${Date.now()}`
  await page.goto('/categories')

  const createForm = page.locator('form')
  await createForm.getByLabel('名稱').fill(categoryName)
  await createForm.getByRole('button', { name: `選擇顏色 ${CATEGORY_COLOR}` }).click()
  await iconButton(createForm, CATEGORY_ICON_LABEL).click()

  const createResponse = page.waitForResponse(
    (response) => response.url().endsWith('/categories') && response.request().method() === 'POST',
  )
  await createForm.getByRole('button', { name: '+ 新增分類' }).click()
  expect((await createResponse).status()).toBe(201)

  // reload 後前端 state / RTK Query 快取全清空，以下斷言的資料只可能來自 GET /categories
  await page.reload()

  // CategoryChip 的根 div 直接包著「編輯 <名稱>」按鈕；以它為 scope 才不會撞到頁面上方
  // 新增表單裡的另一組色票 / 圖示選擇器。
  const chipEditButton = page.getByRole('button', { name: `編輯 ${categoryName}` })
  const chip = chipEditButton.locator('xpath=..')
  await expect(chipEditButton).toBeVisible()

  // 卡片上的圓形徽章底色 = 使用者選的顏色
  expect(await backgroundColorOf(chipEditButton.locator('span').first())).toBe(CATEGORY_COLOR_RGB)

  // 展開就地編輯，色票 / 圖示選擇器的「目前選中」狀態同樣來自後端回傳值
  await chipEditButton.click()
  await expect(chip.getByRole('button', { name: `選擇顏色 ${CATEGORY_COLOR}` })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(iconButton(chip, CATEGORY_ICON_LABEL)).toHaveAttribute('aria-pressed', 'true')
})

test('新增帳戶時自訂顏色與圖示，重新整理後仍保留', async ({ page }) => {
  test.setTimeout(180_000)

  await registerAndLogin(page, uniqueEmail('account-color'), 'e2e-account-password-1')

  const accountName = `e2e帳戶${Date.now()}`
  await page.goto('/accounts')
  await expect(page.getByText('尚未建立任何帳戶')).toBeVisible()

  // 「＋ 新增帳戶」有桌機（Header）與行動端（頁尾全寬）兩顆，靠 Tailwind breakpoint class 決定
  // 顯示哪一顆（`→ FE-063` CSS-only RWD），DOM 內兩顆都在，只取當下可見的那顆。
  await page.getByRole('button', { name: '＋ 新增帳戶' }).filter({ visible: true }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('名稱').fill(accountName)
  await dialog.getByLabel('起始餘額').fill('1500')
  await dialog.getByRole('button', { name: `選擇顏色 ${ACCOUNT_COLOR}` }).click()
  await iconButton(dialog, ACCOUNT_ICON_LABEL).click()

  const createResponse = page.waitForResponse(
    (response) => response.url().endsWith('/accounts') && response.request().method() === 'POST',
  )
  await dialog.getByRole('button', { name: '建立帳戶' }).click()
  expect((await createResponse).status()).toBe(201)

  await page.reload()

  const cardEditButton = page.getByRole('button', { name: `編輯 ${accountName}` })
  await expect(cardEditButton).toBeVisible()

  // 該使用者只有這一個帳戶、且新增對話框已關閉，頁面上唯一帶 inline background-color 的 <span>
  // 就是這張卡片的圓形徽章。
  const badge = page.locator('span[style*="background-color"]')
  await expect(badge).toHaveCount(1)
  expect(await backgroundColorOf(badge)).toBe(ACCOUNT_COLOR_RGB)

  await cardEditButton.click()
  await expect(page.getByRole('button', { name: `選擇顏色 ${ACCOUNT_COLOR}` })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(iconButton(page, ACCOUNT_ICON_LABEL)).toHaveAttribute('aria-pressed', 'true')
})
