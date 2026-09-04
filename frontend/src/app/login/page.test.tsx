import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceAccount } from '@/hooks/useDeviceAccounts'
import LoginPage from './page'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}))

const login = vi.fn()
const useLoginMutation = vi.fn()
const loginWithPin = vi.fn()
const useLoginWithPinMutation = vi.fn()
vi.mock('@/lib/api/authApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/authApi')>('@/lib/api/authApi')
  return {
    getAuthErrorMessage: actual.getAuthErrorMessage,
    useLoginMutation: () => useLoginMutation(),
    useLoginWithPinMutation: () => useLoginWithPinMutation(),
  }
})

const useDeviceAccounts = vi.fn()
vi.mock('@/hooks/useDeviceAccounts', () => ({
  useDeviceAccounts: () => useDeviceAccounts(),
}))

const ACCOUNT: DeviceAccount = {
  user_uid: '11111111-1111-1111-1111-111111111111',
  maskedEmail: 'j***8@gmail.com',
  displayName: 'j1025178',
  avatarColor: '#8257D6',
}

// 同 TransactionFormDialog.test.tsx 慣例：真實跑 useBreakpoint('md')，用 matchMedia stub 控制
// 是否命中 768px 門檻；其餘 media query（如 NumericKeypad 的 useReducedMotion）一律回 false。
function stubMatchMedia(isDesktop: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: media.includes('768px') ? isDesktop : false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

async function typePin(pin: string): Promise<void> {
  for (const digit of pin) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `數字 ${digit}` }))
    })
  }
}

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockClear()
    login.mockReset()
    loginWithPin.mockReset()
    useLoginMutation.mockReturnValue([login, { isLoading: false, error: undefined }])
    useLoginWithPinMutation.mockReturnValue([loginWithPin, { isLoading: false }])
    useDeviceAccounts.mockReturnValue({ accounts: [], rememberAccount: vi.fn(), forgetAccount: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('行動端有記住帳號時預設顯示帳號選擇器', () => {
    stubMatchMedia(false)
    useDeviceAccounts.mockReturnValue({ accounts: [ACCOUNT], rememberAccount: vi.fn(), forgetAccount: vi.fn() })
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: '選擇帳號' })).toBeInTheDocument()
    expect(screen.getByText('j***8@gmail.com')).toBeInTheDocument()
  })

  it('無記住帳號時預設密碼表單（行動端）', () => {
    stubMatchMedia(false)
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: '登入' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('桌機版預設密碼表單，即使有記住帳號', () => {
    stubMatchMedia(true)
    useDeviceAccounts.mockReturnValue({ accounts: [ACCOUNT], rememberAccount: vi.fn(), forgetAccount: vi.fn() })
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: '登入' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '改用 PIN 快速登入' })).toBeInTheDocument()
  })

  it('PinLoginPad 輸入滿 6 碼自動送出並在成功後導向 /dashboard', async () => {
    stubMatchMedia(false)
    useDeviceAccounts.mockReturnValue({ accounts: [ACCOUNT], rememberAccount: vi.fn(), forgetAccount: vi.fn() })
    loginWithPin.mockReturnValue({
      unwrap: () => Promise.resolve({ user_uid: ACCOUNT.user_uid, email: 'j1025178@gmail.com' }),
    })
    render(<LoginPage />)

    fireEvent.click(screen.getByText('j***8@gmail.com'))
    await typePin('123456')

    expect(loginWithPin).toHaveBeenCalledExactlyOnceWith({ user_uid: ACCOUNT.user_uid, pin: '123456' })
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('PIN 錯誤顯示訊息且不導頁', async () => {
    stubMatchMedia(false)
    useDeviceAccounts.mockReturnValue({ accounts: [ACCOUNT], rememberAccount: vi.fn(), forgetAccount: vi.fn() })
    loginWithPin.mockReturnValue({
      unwrap: () => Promise.reject({ status: 401, data: { detail: 'PIN 錯誤' } }),
    })
    render(<LoginPage />)

    fireEvent.click(screen.getByText('j***8@gmail.com'))
    await typePin('000000')

    expect(screen.getByRole('alert')).toHaveTextContent('PIN 錯誤')
    expect(push).not.toHaveBeenCalled()
  })

  it('鎖定（429）時顯示改用密碼登入提示', async () => {
    stubMatchMedia(false)
    useDeviceAccounts.mockReturnValue({ accounts: [ACCOUNT], rememberAccount: vi.fn(), forgetAccount: vi.fn() })
    loginWithPin.mockReturnValue({
      unwrap: () =>
        Promise.reject({ status: 429, data: { detail: 'PIN 已鎖定，請改用密碼登入或稍後再試' } }),
    })
    render(<LoginPage />)

    fireEvent.click(screen.getByText('j***8@gmail.com'))
    await typePin('123456')

    expect(screen.getByRole('alert')).toHaveTextContent('PIN 已鎖定，請改用密碼登入或稍後再試')
    expect(push).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '改用密碼登入' }))
    expect(screen.getByRole('heading', { name: '登入' })).toBeInTheDocument()
  })

  it('行動端「使用其他帳號登入」切到密碼表單', () => {
    stubMatchMedia(false)
    useDeviceAccounts.mockReturnValue({ accounts: [ACCOUNT], rememberAccount: vi.fn(), forgetAccount: vi.fn() })
    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: '+ 使用其他帳號登入' }))

    expect(screen.getByRole('heading', { name: '登入' })).toBeInTheDocument()
  })

  it('密碼表單送出成功後導向 /dashboard', async () => {
    stubMatchMedia(false)
    login.mockReturnValue({ unwrap: () => Promise.resolve({ user_uid: 'u1', email: 'a@b.com' }) })
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'password123' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '登入' }))
    })

    expect(login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password123' })
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('mutation 回錯誤時顯示錯誤訊息，不導向', () => {
    stubMatchMedia(false)
    useLoginMutation.mockReturnValue([
      login,
      { isLoading: false, error: { status: 401, data: { detail: '帳號或密碼錯誤' } } },
    ])
    render(<LoginPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('帳號或密碼錯誤')
    expect(push).not.toHaveBeenCalled()
  })
})
