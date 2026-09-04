import { createElement, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { Provider } from 'react-redux'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeStore } from '@/store/store'
import {
  useChangePinMutation,
  useDeletePinMutation,
  useLoginWithPinMutation,
  useSetPinMutation,
} from '@/lib/api/authApi'
import { useDeviceAccounts } from './useDeviceAccounts'

// resolveApiBaseUrl()：jsdom 環境 window 已定義（非 server），測試未設 NEXT_PUBLIC_API_URL，
// 故落回 baseApi.ts 的 FALLBACK 常數（→ 同 dashboardApi.test.ts 慣例）。
const BASE_URL = 'http://localhost:8000/api/v1'
const PIN_URL = `${BASE_URL}/auth/pin`
const LOGIN_PIN_URL = `${BASE_URL}/auth/login/pin`

const USER = { user_uid: '11111111-1111-1111-1111-111111111111', email: 'j1025178@gmail.com' }

// FE-012：一律用 msw 攔截真實 HTTP request，禁 mock fetch / RTK hook 本身
const server = setupServer(
  http.post(PIN_URL, () =>
    HttpResponse.json({ success: true, data: null, detail: null, response_code: 201 }, { status: 201 }),
  ),
  http.patch(PIN_URL, () =>
    HttpResponse.json({ success: true, data: null, detail: null, response_code: 200 }),
  ),
  http.delete(PIN_URL, () =>
    HttpResponse.json({ success: true, data: null, detail: null, response_code: 200 }),
  ),
  http.post(LOGIN_PIN_URL, () =>
    HttpResponse.json({ success: true, data: USER, detail: null, response_code: 200 }),
  ),
)

function renderWithStore<T>(useHook: () => T) {
  const store = makeStore()
  // eslint-disable-next-line react/no-children-prop
  const wrapper = ({ children }: { children: ReactNode }) => createElement(Provider, { store, children })
  return renderHook(useHook, { wrapper })
}

describe('authApi PIN mutations', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('setPin 成功（201）時 mutation 回報成功', async () => {
    const { result } = renderWithStore(() => useSetPinMutation())
    const [setPin] = result.current

    await act(async () => {
      await setPin({ pin: '123456', password: 'correct horse battery' })
    })

    await waitFor(() => expect(result.current[1].isSuccess).toBe(true))
  })

  it('setPin 已設定過 PIN 時回 409', async () => {
    server.use(
      http.post(PIN_URL, () =>
        HttpResponse.json(
          { success: false, data: null, detail: 'PIN 已設定，請使用變更 PIN', response_code: 409 },
          { status: 409 },
        ),
      ),
    )
    const { result } = renderWithStore(() => useSetPinMutation())
    const [setPin] = result.current

    await act(async () => {
      await setPin({ pin: '123456', password: 'wrong' })
    })

    await waitFor(() => expect(result.current[1].isError).toBe(true))
    const error = result.current[1].error
    expect(error && 'status' in error && error.status).toBe(409)
    expect(error && 'data' in error && (error.data as { detail: string }).detail).toBe(
      'PIN 已設定，請使用變更 PIN',
    )
  })

  it('setPin 密碼錯誤時回 401', async () => {
    server.use(
      http.post(PIN_URL, () =>
        HttpResponse.json({ success: false, data: null, detail: '密碼錯誤', response_code: 401 }, { status: 401 }),
      ),
    )
    const { result } = renderWithStore(() => useSetPinMutation())
    const [setPin] = result.current

    await act(async () => {
      await setPin({ pin: '123456', password: 'wrong' })
    })

    await waitFor(() => expect(result.current[1].isError).toBe(true))
    const error = result.current[1].error
    expect(error && 'status' in error && error.status).toBe(401)
  })

  it('changePin 成功（200）時 mutation 回報成功', async () => {
    const { result } = renderWithStore(() => useChangePinMutation())
    const [changePin] = result.current

    await act(async () => {
      await changePin({ current_pin: '123456', new_pin: '654321' })
    })

    await waitFor(() => expect(result.current[1].isSuccess).toBe(true))
  })

  it('changePin current_pin 錯誤時回 401', async () => {
    server.use(
      http.patch(PIN_URL, () =>
        HttpResponse.json({ success: false, data: null, detail: 'PIN 錯誤', response_code: 401 }, { status: 401 }),
      ),
    )
    const { result } = renderWithStore(() => useChangePinMutation())
    const [changePin] = result.current

    await act(async () => {
      await changePin({ current_pin: '000000', new_pin: '654321' })
    })

    await waitFor(() => expect(result.current[1].isError).toBe(true))
    const error = result.current[1].error
    expect(error && 'status' in error && error.status).toBe(401)
  })

  it('deletePin 成功（200）時 mutation 回報成功', async () => {
    const { result } = renderWithStore(() => useDeletePinMutation())
    const [deletePin] = result.current

    await act(async () => {
      await deletePin({ password: 'correct horse battery' })
    })

    await waitFor(() => expect(result.current[1].isSuccess).toBe(true))
  })

  it('deletePin 密碼錯誤時回 401', async () => {
    server.use(
      http.delete(PIN_URL, () =>
        HttpResponse.json({ success: false, data: null, detail: '密碼錯誤', response_code: 401 }, { status: 401 }),
      ),
    )
    const { result } = renderWithStore(() => useDeletePinMutation())
    const [deletePin] = result.current

    await act(async () => {
      await deletePin({ password: 'wrong' })
    })

    await waitFor(() => expect(result.current[1].isError).toBe(true))
    const error = result.current[1].error
    expect(error && 'status' in error && error.status).toBe(401)
  })

  it('loginWithPin 成功（200）時回傳 unwrap 後的使用者資料', async () => {
    const { result } = renderWithStore(() => useLoginWithPinMutation())
    const [loginWithPin] = result.current

    await act(async () => {
      await loginWithPin({ user_uid: USER.user_uid, pin: '123456' })
    })

    await waitFor(() => expect(result.current[1].isSuccess).toBe(true))
    expect(result.current[1].data).toEqual(USER)
  })

  it('loginWithPin PIN 錯誤時回 401', async () => {
    server.use(
      http.post(LOGIN_PIN_URL, () =>
        HttpResponse.json({ success: false, data: null, detail: 'PIN 錯誤', response_code: 401 }, { status: 401 }),
      ),
    )
    const { result } = renderWithStore(() => useLoginWithPinMutation())
    const [loginWithPin] = result.current

    await act(async () => {
      await loginWithPin({ user_uid: USER.user_uid, pin: '000000' })
    })

    await waitFor(() => expect(result.current[1].isError).toBe(true))
    const error = result.current[1].error
    expect(error && 'status' in error && error.status).toBe(401)
  })

  it('loginWithPin 連續失敗鎖定後回 429', async () => {
    server.use(
      http.post(LOGIN_PIN_URL, () =>
        HttpResponse.json(
          { success: false, data: null, detail: 'PIN 已鎖定，請改用密碼登入或稍後再試', response_code: 429 },
          { status: 429 },
        ),
      ),
    )
    const { result } = renderWithStore(() => useLoginWithPinMutation())
    const [loginWithPin] = result.current

    await act(async () => {
      await loginWithPin({ user_uid: USER.user_uid, pin: '123456' })
    })

    await waitFor(() => expect(result.current[1].isError).toBe(true))
    const error = result.current[1].error
    expect(error && 'status' in error && error.status).toBe(429)
    expect(error && 'data' in error && (error.data as { detail: string }).detail).toBe(
      'PIN 已鎖定，請改用密碼登入或稍後再試',
    )
  })
})

describe('useDeviceAccounts', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('localStorage 無值時回傳空清單', () => {
    const { result } = renderHook(() => useDeviceAccounts())
    expect(result.current.accounts).toEqual([])
  })

  it('rememberAccount 新增帳號：遮罩 email、顯示名稱、頭像色與 user_uid 皆正確，且 localStorage 不含 PIN 或密碼明文', () => {
    const { result } = renderHook(() => useDeviceAccounts())

    act(() => {
      result.current.rememberAccount(USER)
    })

    expect(result.current.accounts).toHaveLength(1)
    const account = result.current.accounts[0]
    expect(account).toBeDefined()
    if (!account) return
    expect(account.user_uid).toBe(USER.user_uid)
    expect(account.maskedEmail).toBe('j***8@gmail.com')
    expect(account.displayName).toBe('j1025178')
    expect(account.avatarColor).toMatch(/^#[0-9A-Fa-f]{6}$/)

    const raw = window.localStorage.getItem('device-accounts') ?? ''
    expect(raw.toLowerCase()).not.toContain('pin')
    expect(raw.toLowerCase()).not.toContain('password')
    expect(raw).not.toContain('123456')
  })

  it('rememberAccount 對同一 user_uid 呼叫兩次時更新既有項目，不產生重複', () => {
    const { result } = renderHook(() => useDeviceAccounts())

    act(() => {
      result.current.rememberAccount(USER)
    })
    act(() => {
      result.current.rememberAccount({ ...USER, email: 'j-new@example.com' })
    })

    expect(result.current.accounts).toHaveLength(1)
    const account = result.current.accounts[0]
    expect(account).toBeDefined()
    if (!account) return
    expect(account.maskedEmail).toBe('j***w@example.com')
  })

  it('forgetAccount 移除指定 user_uid 的帳號', () => {
    const { result } = renderHook(() => useDeviceAccounts())
    const otherUser = { user_uid: '22222222-2222-2222-2222-222222222222', email: 'other@example.com' }

    act(() => {
      result.current.rememberAccount(USER)
      result.current.rememberAccount(otherUser)
    })
    expect(result.current.accounts).toHaveLength(2)

    act(() => {
      result.current.forgetAccount(USER.user_uid)
    })

    expect(result.current.accounts).toHaveLength(1)
    const remaining = result.current.accounts[0]
    expect(remaining).toBeDefined()
    if (!remaining) return
    expect(remaining.user_uid).toBe(otherUser.user_uid)
  })

  it('讀取：新掛載的 hook 實例能讀回先前寫入 localStorage 的帳號清單', () => {
    const first = renderHook(() => useDeviceAccounts())
    act(() => {
      first.result.current.rememberAccount(USER)
    })

    const second = renderHook(() => useDeviceAccounts())
    expect(second.result.current.accounts).toHaveLength(1)
    const account = second.result.current.accounts[0]
    expect(account).toBeDefined()
    if (!account) return
    expect(account.user_uid).toBe(USER.user_uid)
  })
})
