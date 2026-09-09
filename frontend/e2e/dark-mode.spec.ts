import { expect, test, type Page } from '@playwright/test'

// e2e：propose-v1.1.0.md 對外承諾的手測項目 (5) ——「切換 Dark Mode 後頁面色彩改變，重新整理後
// 偏好仍被記住」。對真實 backend / DB / 瀏覽器跑，不 mock 任何一層（→ AGENTS.md § Testing）。
//
// 驗的是 design-spec §2.7 的三態外觀（light / dark / system）與其套用機制：
//   1. `<ThemeToggle>` 依 light → dark → system 固定順序循環，偏好寫進 localStorage
//      `theme-preference`（`→ A11` 同一「同裝置記住」慣例）。
//   2. 偏好同步到 `<html data-theme>`；system 時**不寫**該屬性，交給
//      `@media (prefers-color-scheme: dark)` 接管。
//   3. 首次載入由 `app/layout.tsx` 的 inline script 在 hydrate 前套用（避免 FOUC）。
// 斷言一律看「實際 render 出來的顏色」（computed style / CSS variable），不只看 class 或屬性：
// 屬性對了但 tokens 沒接上的話，使用者看到的仍是淺色畫面。

// design-spec §2.2 / §2.2.1 的 `--color-bg` 與 `--color-text-primary`（globals.css 唯一寫處）
const LIGHT_BG = 'rgb(250, 248, 252)' // #FAF8FC
const DARK_BG = 'rgb(28, 24, 38)' // #1C1826
const LIGHT_TEXT = 'rgb(43, 39, 64)' // #2B2740
const DARK_TEXT = 'rgb(240, 237, 247)' // #F0EDF7

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

function storedThemePreference(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('theme-preference'))
}

test('切換 Dark Mode 後頁面色彩改變，重新整理後偏好仍被記住', async ({ page }) => {
  test.setTimeout(180_000)

  await registerAndLogin(page, uniqueEmail('dark-mode'), 'e2e-dark-mode-password-1')

  // `/settings` 的「外觀」區塊是三個 <ThemeToggle> 掛載點之一，且該頁不套 <AppShell>
  // （Sidebar 另有一顆），頁面上只有這一顆切換鈕。
  await page.goto('/settings')
  const pageMain = page.locator('main')
  const heading = page.getByRole('heading', { name: '設定' })
  const themeToggle = page.getByRole('button', { name: /^外觀：/ })

  // 初始為 system：不寫 data-theme，headless Chromium 的 prefers-color-scheme 預設 light
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  expect(await storedThemePreference(page)).toBeNull()
  await expect(pageMain).toHaveCSS('background-color', LIGHT_BG)
  await expect(heading).toHaveCSS('color', LIGHT_TEXT)

  // 第 1 次點擊：system → light（`→ ThemeToggle.tsx` CYCLE）
  await themeToggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await storedThemePreference(page)).toBe('light')

  // 第 2 次點擊：light → dark，畫面色彩實際翻成深色
  await themeToggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(pageMain).toHaveCSS('background-color', DARK_BG)
  await expect(heading).toHaveCSS('color', DARK_TEXT)
  expect(await storedThemePreference(page)).toBe('dark')

  // tokens 本身（而非只有某個元素的 class）確實換成 Dark 那一組
  const darkBgToken = await page.evaluate(() =>
    window.getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
  )
  expect(darkBgToken.toLowerCase()).toBe('#1c1826')

  // 重新整理：偏好由 localStorage 讀回，且 <html data-theme> 由 layout.tsx 的 inline script
  // 在 hydrate 前就套好（無 FOUC，→ §2.7）
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(pageMain).toHaveCSS('background-color', DARK_BG)
  await expect(heading).toHaveCSS('color', DARK_TEXT)
  expect(await storedThemePreference(page)).toBe('dark')

  // 換一頁同樣是 Dark（偏好是全站的，不是單頁 state）
  await page.goto('/categories')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('main')).toHaveCSS('background-color', DARK_BG)

  // 第 3 次點擊回到 system：移除 data-theme，色彩回到（OS 為 light 的）淺色
  await page.goto('/settings')
  await page.getByRole('button', { name: /^外觀：/ }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  expect(await storedThemePreference(page)).toBe('system')
  await expect(page.locator('main')).toHaveCSS('background-color', LIGHT_BG)
})
