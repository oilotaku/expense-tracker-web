import { expect, test, type Locator, type Page } from '@playwright/test'

// e2e：propose-v1.1.0.md 對外承諾的手測項目 (1) ——「設定 PIN 後用 PIN 快速登入成功；連續輸入
// 錯誤 PIN 5 次後被鎖定」。對真實 backend / DB 跑，不 mock 任何一層（→ AGENTS.md § Testing）。
//
// 驗的是 design-spec.md §12.2（`→ A15`）的鎖定策略：`POST /auth/login/pin` 連續失敗 5 次
// （第 1–5 次回 401「PIN 錯誤」，第 5 次同時寫入 `pin_locked_until = now + 15min`），第 6 次
// 起在鎖定期間內一律回 429「PIN 已鎖定，請改用密碼登入或稍後再試」且不再比對 PIN 本身。
//
// **刻意不驗「15 分鐘後自動解鎖」**：後端鎖定時間是服務層寫死的 `_PIN_LOCK_MINUTES = 15`
// （backend/app/services/auth_service.py），沒有 env / query 之類的測試用縮短開關，也沒有可從
// 瀏覽器端注入的時鐘（鎖定判斷發生在後端行程內，前端 `page.clock` 動不到）。真的等 15 分鐘會讓
// 這支 spec 成為整條 CI 的瓶頸，收益卻只是重測一段時間比較邏輯。本 spec 因此只驗「觸發鎖定當下」
// 的對外行為（第 6 次被拒 + 畫面顯示改用密碼登入的訊息）。

const CORRECT_PIN = '135790'
const WRONG_PIN = '246801'
const PIN_LOCK_THRESHOLD = 5

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

// 依 `useDeviceAccounts.ts` 的 maskEmail 慣例（local-part 只留首尾各 1 碼），供下方
// seedDeviceAccount 產生與正式流程同形狀的展示資料。
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@')
  const local = email.slice(0, atIndex)
  const domain = email.slice(atIndex)
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}${domain}`
}

/** 註冊 + 密碼登入，回傳登入回應帶回的 `user_uid`（`POST /auth/login/pin` 需要它）。 */
async function registerAndLogin(page: Page, email: string, password: string): Promise<string> {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '註冊' }).click()
  // 註冊成功導向登入頁時會帶「註冊後首次登入」訊號（→ register/page.tsx），
  // 登入成功後由該訊號在 /dashboard 觸發一次性的 PIN 快速登入提醒
  await expect(page).toHaveURL(/\/login\?justRegistered=1$/)

  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST',
  )
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('密碼').fill(password)
  await page.getByRole('button', { name: '登入' }).click()
  const loginBody = (await (await loginResponsePromise).json()) as { data: { user_uid: string } }
  await expect(page).toHaveURL(/\/dashboard$/)
  return loginBody.data.user_uid
}

// 自訂數字鍵盤（`<NumericKeypad mode="pin">`）滿 6 碼自動送出，故「按完第 6 顆」等同送出。
async function pressPinDigits(scope: Page | Locator, pin: string): Promise<void> {
  for (const digit of pin) {
    await scope.getByRole('button', { name: `數字 ${digit}` }).click()
  }
}

/**
 * 送出一次 PIN 快速登入並回傳 `POST /auth/login/pin` 的實際 HTTP 狀態碼。
 * 用 response 而非畫面訊息當同步點：連續 6 次嘗試的錯誤文字有重複（前 5 次都是「PIN 錯誤」），
 * 只靠文字無法分辨「這次的結果」與「上次殘留的結果」。
 */
async function attemptPinLogin(page: Page, pin: string): Promise<number> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/auth/login/pin') && response.request().method() === 'POST',
  )
  await pressPinDigits(page, pin)
  const response = await responsePromise
  return response.status()
}

/**
 * 註冊帳號 → 密碼登入 → 於 `/settings` 設定 PIN，回傳登入畫面上該帳號的遮罩 email。
 * 完成後已清除 cookie（等同登出），呼叫端可直接走 PIN 登入流程。
 */
async function registerAccountWithPin(page: Page, label: string): Promise<string> {
  const email = uniqueEmail(label)
  const password = `e2e-${label}-password-1`

  const userUid = await registerAndLogin(page, email, password)
  const maskedEmail = maskEmail(email)

  // 設定 PIN（design-spec §9.7 / §12.2）：先用目前密碼重新驗證身份，再輸入兩次一致的 6 碼 PIN
  await page.goto('/settings')
  await page.getByRole('button', { name: '設定 PIN' }).click()
  await page.getByLabel('請先輸入目前密碼以驗證身份').fill(password)
  await page.getByRole('button', { name: '下一步' }).click()

  await expect(page.getByText('請輸入新的 6 碼 PIN')).toBeVisible()
  await pressPinDigits(page, CORRECT_PIN)
  await expect(page.getByText('請再輸入一次以確認')).toBeVisible()
  await pressPinDigits(page, CORRECT_PIN)

  // 設定成功後設定頁改顯示「變更 / 停用」兩顆按鈕（→ settings/page.tsx handleSetPinSuccess）
  await expect(page.getByRole('button', { name: '變更 PIN' })).toBeVisible()

  // 已知前端缺口（本 spec 執行時發現，非本 task affected_files 可修）：`useDeviceAccounts` 的
  // `rememberAccount` 在正式程式碼中**從未被呼叫**（只在 useDeviceAccounts.test.ts 出現），
  // 設定頁設定完 PIN 只寫了自己的 `pin-status:<user_uid>` 旗標，沒有把帳號加進 `device-accounts`。
  // 結果是 /login 的 `hasAccounts` 恆為 false、「改用 PIN 快速登入」入口永遠不出現，使用者實際上
  // 走不到 PIN 登入畫面。這裡先以測試 fixture 補上那筆「本裝置記住的帳號」（純展示資料，
  // → design-spec §1 [A3]：只有遮罩 email / 顯示名稱 / 頭像色 / user_uid，不含 PIN 或密碼），
  // 讓本 spec 仍能驗到真正要驗的東西——PIN 登入 API 與鎖定機制的端到端行為。
  await page.evaluate(
    ({ uid, masked, name }) => {
      window.localStorage.setItem(
        'device-accounts',
        JSON.stringify([
          { user_uid: uid, maskedEmail: masked, displayName: name, avatarColor: '#8257D6' },
        ]),
      )
    },
    { uid: userUid, masked: maskedEmail, name: email.slice(0, email.indexOf('@')) },
  )

  // 清 cookie 模擬登出（backend 未提供 POST /auth/logout，→ authApi.ts / fixed.md §4）
  await page.context().clearCookies()
  return maskedEmail
}

// 從 Email+密碼表單切到「帳號選擇 → PIN 輸入」畫面（桌機預設顯示密碼表單，→ login/page.tsx）。
async function openPinPad(page: Page, maskedEmail: string): Promise<void> {
  await page.goto('/login')
  await page.getByRole('button', { name: '改用 PIN 快速登入' }).click()
  await page.getByRole('button', { name: maskedEmail }).click()
  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible()
}

test('設定 PIN 後可用 PIN 快速登入', async ({ page }) => {
  // 註冊 / 密碼登入 / 設定 PIN / PIN 登入，每步都含一次 bcrypt，累積遠超過預設的 60s
  // （playwright.config.ts）。這是單純的「步驟多」，不是等待逾時。
  test.setTimeout(180_000)

  const maskedEmail = await registerAccountWithPin(page, 'pin-login')

  await openPinPad(page, maskedEmail)
  expect(await attemptPinLogin(page, CORRECT_PIN)).toBe(200)
  await expect(page).toHaveURL(/\/dashboard$/)
})

/**
 * 本 spec 第一次跑起來時曾抓到 **PIN 鎖定機制在真實環境完全失效** —— 連續錯 5 次後第 6 次仍
 * 回 401（不是 429），`user_credentials.pin_failed_attempts` 在 DB 內恆為 0。
 *
 * 根因當時是：`AuthService._verify_pin_or_raise` 先 `record_pin_failure()`（只 `flush`，不
 * commit）再 `raise AppError(401)`；但 `app/api/deps.py::get_db` 的 `except Exception: await
 * session.rollback()` 會把剛剛 flush 的失敗次數一起回捲，於是每次失敗都從 0 重新算，永遠到不了
 * 門檻 5。後端整合測試（`tests/api/test_auth_pin.py`）之所以是綠的，是因為 `tests/conftest.py`
 * 的 `_override_get_db` 只 `yield` 一個共用 session、**沒有**複製正式 `get_db` 的
 * commit/rollback 生命週期，例外時不回捲，所以失敗次數在測試裡活了下來 —— 典型的 test double
 * 與正式路徑行為分歧造成的假綠燈。
 *
 * task-030 已修：`_verify_pin_or_raise` 在 `record_pin_failure()` 後、`raise` 前先明確
 * `await self.db.commit()`，讓失敗次數在被通用 rollback 回捲前就已落地（→
 * `backend/app/services/auth_service.py` 該處註解）。此測試已由 `test.fail()` 改回一般斷言。
 */
test('連續輸入錯誤 PIN 5 次後，第 6 次被鎖定（design-spec §12.2 / A15）', async ({ page }) => {
  test.setTimeout(240_000)

  const maskedEmail = await registerAccountWithPin(page, 'pin-lock')
  await openPinPad(page, maskedEmail)

  // 限定在頁面 <main> 內找 alert：Next.js App Router 會在 <body> 底下常駐一個
  // `#__next-route-announcer__`（`role="alert"`）的路由播報節點，未限定範圍會撞到 strict mode。
  const pinAlert = page.getByRole('main').getByRole('alert')

  // 第 1–5 次回 401「PIN 錯誤」，第 5 次同時寫入鎖定時間
  for (let attempt = 1; attempt <= PIN_LOCK_THRESHOLD; attempt += 1) {
    expect(await attemptPinLogin(page, WRONG_PIN)).toBe(401)
    await expect(pinAlert).toHaveText('PIN 錯誤')
  }

  // 第 6 次：即使輸入的是「正確」的 PIN 也一律被鎖定擋下（後端不再比對 PIN 本身）
  expect(await attemptPinLogin(page, CORRECT_PIN)).toBe(429)
  await expect(pinAlert).toHaveText('PIN 已鎖定，請改用密碼登入或稍後再試')
  await expect(page).toHaveURL(/\/login$/)

  // 鎖定後鍵盤停用，只留「改用密碼登入」這條路（→ PinLoginPad.tsx isLocked）
  await expect(page.getByRole('button', { name: '數字 1' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '改用密碼登入' })).toBeVisible()
})
