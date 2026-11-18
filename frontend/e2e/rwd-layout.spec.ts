import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

// e2e：RWD 版面守門。以「大金額 + 長名稱 + 長備註」的壓力資料，在手機 / 橫向手機 / 平板 / 桌機
// 各寬度檢查版面不被撐破。jsdom 量不到實際排版，所以放在 e2e，對真實 backend / DB 跑。
// 情境：S-RWD-01..06（見各 test 名稱）。

function resolveApiBaseUrl(): string {
  const explicit = process.env.E2E_API_BASE_URL
  if (explicit) return explicit
  const base = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000')
  return `${base.protocol}//${base.hostname}:8000/api/v1`
}

const API_BASE_URL = resolveApiBaseUrl()

interface Viewport {
  name: string
  width: number
  height: number
  touch: boolean
}

const PHONE_320: Viewport = { name: '手機 320', width: 320, height: 640, touch: true }
const PHONE_390: Viewport = { name: '手機 390', width: 390, height: 844, touch: true }
const PHONE_LANDSCAPE: Viewport = { name: '手機橫向 844x390', width: 844, height: 390, touch: true }
const TABLET_768: Viewport = { name: '平板直向 768', width: 768, height: 1024, touch: true }
const TABLET_1024: Viewport = { name: '平板橫向 1024', width: 1024, height: 768, touch: true }
const DESKTOP_1280: Viewport = { name: '桌機 1280', width: 1280, height: 800, touch: false }
const ALL_VIEWPORTS = [PHONE_320, PHONE_390, PHONE_LANDSCAPE, TABLET_768, TABLET_1024, DESKTOP_1280]
const TOUCH_VIEWPORTS = ALL_VIEWPORTS.filter((viewport) => viewport.touch)

const AUTHED_PAGES = [
  '/dashboard',
  '/transactions',
  '/accounts',
  '/assets',
  '/budgets',
  '/categories',
  '/recurring',
  '/icons',
  '/settings',
  '/change-password',
]

const LONG_ACCOUNT_NAME = '永豐銀行大戶數位帳戶外幣綜合存款超長名稱'
const LONG_NOTE = '這是一段很長很長的備註文字用來測試在窄螢幕上會不會把版面撐破或者整張卡片被拉得非常高'

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>

async function seedStressData(browser: Browser): Promise<StorageState> {
  const context = await browser.newContext()
  const request = context.request
  const email = `e2e-rwd-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const password = 'e2e-rwd-password-1'
  expect((await request.post(`${API_BASE_URL}/auth/register`, { data: { email, password } })).ok()).toBeTruthy()
  expect((await request.post(`${API_BASE_URL}/auth/login`, { data: { email, password } })).ok()).toBeTruthy()

  const accountUids: string[] = []
  const accounts = [
    { name: LONG_ACCOUNT_NAME, balance: '1234567890.12' },
    { name: '台新 Richart', balance: '98765.43' },
    { name: '中華郵政儲金帳戶', balance: '4321.00' },
  ]
  for (const account of accounts) {
    const response = await request.post(`${API_BASE_URL}/accounts`, {
      data: { ...account, color: '#8B6ED6', icon: 'wallet' },
    })
    expect(response.ok()).toBeTruthy()
    accountUids.push(((await response.json()) as { data: { account_uid: string } }).data.account_uid)
  }

  // 分類由後端 DB trigger 於註冊時種好預設值
  const categoriesResponse = await request.get(`${API_BASE_URL}/categories`)
  const categories = ((await categoriesResponse.json()) as { data: { items: { category_uid: string }[] } }).data.items

  const now = new Date().toISOString()
  const transactions = [
    { amount: '12345678.90', type: 'income', description: LONG_NOTE },
    { amount: '2345678.00', type: 'expense', description: LONG_NOTE },
    { amount: '88.00', type: 'expense', description: '午餐' },
  ]
  for (const [index, transaction] of transactions.entries()) {
    const response = await request.post(`${API_BASE_URL}/transactions`, {
      data: {
        account_uid: accountUids[index % accountUids.length],
        category_uid: categories[index % categories.length]?.category_uid,
        transaction_date: now,
        description: transaction.description,
        amount: transaction.amount,
        transaction_type: transaction.type,
        payment_method: '信用卡',
      },
    })
    expect(response.ok()).toBeTruthy()
  }
  const liability = await request.post(`${API_BASE_URL}/liabilities`, {
    data: { name: '房屋貸款第一順位抵押超長名稱', amount: '8765432.10', interest_rate: '2.15' },
  })
  expect(liability.ok()).toBeTruthy()

  const state = await context.storageState()
  await context.close()
  return state
}

async function openPage(browser: Browser, state: StorageState, viewport: Viewport, path: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    storageState: state,
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.touch,
    isMobile: viewport.touch && viewport.width < 768,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
  })
  const page = await context.newPage()
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  // 登入狀態失效會被導回 /login，login 頁本身版面正常，不擋就會讓多數情境假綠
  await expect(page).not.toHaveURL(/\/login/)
  // 圖表（recharts ResponsiveContainer）量完尺寸後才會撐出最終寬度
  await page.waitForTimeout(1500)
  return { page, close: () => context.close() }
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

let storageState: StorageState

test.describe('RWD 版面', () => {
  test.describe.configure({ timeout: 240_000 })

  // 失敗時 Playwright 會換新 worker 重跑 beforeAll；註冊有限流，所以種過的登入狀態存檔給後續 worker 重用
  test.beforeAll(async ({ browser }) => {
    const cachePath = path.join(process.env.E2E_STATE_DIR ?? os.tmpdir(), `e2e-rwd-state-${new URL(API_BASE_URL).host}.json`)
    const cached = fs.existsSync(cachePath) && Date.now() - fs.statSync(cachePath).mtimeMs < 30 * 60_000
    if (cached) {
      storageState = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as StorageState
      return
    }
    storageState = await seedStressData(browser)
    // 內含測試帳號的 session cookie，只給自己讀
    fs.writeFileSync(cachePath, JSON.stringify(storageState), { mode: 0o600 })
  })

  for (const viewport of ALL_VIEWPORTS) {
    test(`S-RWD-01 ${viewport.name}：每一頁都沒有水平捲動`, async ({ browser }) => {
      const overflows: string[] = []
      for (const path of AUTHED_PAGES) {
        const { page, close } = await openPage(browser, storageState, viewport, path)
        const overflow = await horizontalOverflow(page)
        if (overflow > 0) overflows.push(`${path} 多出 ${overflow}px`)
        await close()
      }
      expect(overflows).toEqual([])
    })
  }

  for (const viewport of [PHONE_320, PHONE_390, TABLET_768, DESKTOP_1280]) {
    test(`S-RWD-02 ${viewport.name}：總覽金額卡的數字完整顯示、不被裁切，字級不低於 14px（FE-059）`, async ({ browser }) => {
      const { page, close } = await openPage(browser, storageState, viewport, '/dashboard')
      const values = page.locator('section[aria-label="期間彙總"] p.tabular-nums')
      await expect(values.first()).toBeVisible()
      const clipped = await values.evaluateAll((elements) =>
        elements
          .filter((element) => {
            const card = element.parentElement?.getBoundingClientRect()
            const box = element.getBoundingClientRect()
            return element.scrollWidth > element.clientWidth + 1 || (card !== undefined && box.right > card.right + 1)
          })
          .map((element) => element.textContent ?? ''),
      )
      const tooSmall = await values.evaluateAll((elements) =>
        elements
          .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 14)
          .map((element) => `${element.textContent ?? ''} ${getComputedStyle(element).fontSize}`),
      )
      await close()
      expect(clipped).toEqual([])
      expect(tooSmall).toEqual([])
    })
  }

  for (const viewport of ALL_VIEWPORTS) {
    test(`S-RWD-03 ${viewport.name}：帳戶卡片的編輯 / 刪除鈕都在卡片內`, async ({ browser }) => {
      const { page, close } = await openPage(browser, storageState, viewport, '/accounts')
      const buttons = page.locator('button[aria-label^="刪除"], button[aria-label^="編輯"]')
      // 種了 3 個帳戶 + 註冊預設帳戶，每個都有編輯、刪除兩顆；找不到就是頁面沒正常顯示
      expect(await buttons.count()).toBeGreaterThanOrEqual(6)
      const outside = await buttons.evaluateAll((buttons) =>
        buttons
          .filter((button) => {
            let card: HTMLElement | null = button.parentElement
            while (card && !card.classList.contains('shadow-card')) card = card.parentElement
            if (!card) return true
            const box = button.getBoundingClientRect()
            const cardBox = card.getBoundingClientRect()
            return box.right > cardBox.right + 1 || box.left < cardBox.left - 1
          })
          .map((button) => button.getAttribute('aria-label') ?? ''),
      )
      await close()
      expect(outside).toEqual([])
    })
  }

  for (const viewport of [PHONE_320, PHONE_390]) {
    test(`S-RWD-04 ${viewport.name}：交易卡片長備註最多兩行、金額不壓到文字`, async ({ browser }) => {
      const { page, close } = await openPage(browser, storageState, viewport, '/transactions')
      const note = page.locator('.lg\\:hidden').getByText(LONG_NOTE, { exact: false }).first()
      await expect(note).toBeVisible()
      const lineCount = await note.evaluate((element) => {
        const lineHeight = parseFloat(getComputedStyle(element).lineHeight)
        return Math.round(element.getBoundingClientRect().height / lineHeight)
      })
      // 卡片第一層 flex 的兩欄：左＝圖示 + 文字，右＝金額 + 刪除鈕；任何一個文字節點越過右欄左緣即算重疊
      const overlaps = await page.locator('.lg\\:hidden .shadow-card').evaluateAll((cards) =>
        cards.filter((card) => {
          const row = card.firstElementChild
          const left = row?.children[0]
          const right = row?.children[1]
          if (!left || !right) return true
          const rightLeftEdge = right.getBoundingClientRect().left
          return [...left.querySelectorAll('span')].some((span) => span.getBoundingClientRect().right > rightLeftEdge + 1)
        }).length,
      )
      // 左欄第一行「日期・分類」：一般手機寬度（≥375）要完整顯示，不能被省略號吃掉分類
      const truncatedHeads = await page.locator('.lg\\:hidden .shadow-card').evaluateAll((cards) =>
        cards
          .map((card) => card.firstElementChild?.children[0]?.lastElementChild?.firstElementChild)
          .filter((span): span is Element => !!span && span.scrollWidth > span.clientWidth + 1)
          .map((span) => span.textContent ?? ''),
      )
      // 帳戶名稱要獨立顯示，不能跟長備註一起被兩行限制的省略號吃掉
      const noteCard = page.locator('.lg\\:hidden .shadow-card').filter({ hasText: LONG_NOTE }).filter({ hasText: '台新 Richart' })
      await expect(noteCard.getByText('台新 Richart', { exact: true })).toBeVisible()
      await close()
      expect(lineCount).toBeLessThanOrEqual(2)
      expect(overlaps).toBe(0)
      if (viewport.width >= 375) expect(truncatedHeads).toEqual([])
    })
  }

  for (const viewport of TOUCH_VIEWPORTS.filter((v) => v.width < 768)) {
    test(`S-RWD-05 ${viewport.name}：輸入框字級至少 16px（iOS 點下去不會自動放大）`, async ({ browser }) => {
      const small: string[] = []
      for (const path of AUTHED_PAGES) {
        const { page, close } = await openPage(browser, storageState, viewport, path)
        const found = await page
          .locator('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):visible, select:visible, textarea:visible')
          .evaluateAll((elements) =>
            elements
              .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 16)
              .map((element) => `${element.tagName.toLowerCase()} ${getComputedStyle(element).fontSize}`),
          )
        small.push(...found.map((item) => `${path} ${item}`))
        await close()
      }
      expect(small).toEqual([])
    })
  }

  for (const viewport of [PHONE_320, PHONE_390, TABLET_768]) {
    test(`S-RWD-06 ${viewport.name}：獨立的文字連結 / 按鈕點擊高度至少 44px（FE-058）`, async ({ browser }) => {
      const tooSmall: string[] = []
      const targets: [string, RegExp][] = [
        ['/dashboard', /查看全部/],
        ['/assets', /設定定期還款/],
      ]
      for (const [path, name] of targets) {
        const { page, close } = await openPage(browser, storageState, viewport, path)
        let found = 0
        for (const box of await page.getByRole('link', { name }).or(page.getByRole('button', { name })).all()) {
          if (!(await box.isVisible())) continue
          found += 1
          const rect = await box.boundingBox()
          if (!rect || rect.height < 44) tooSmall.push(`${path} ${await box.textContent()} ${Math.round(rect?.height ?? 0)}px`)
        }
        await close()
        if (found === 0) tooSmall.push(`${path} 找不到「${name.source}」`)
      }
      expect(tooSmall).toEqual([])
    })
  }
})
