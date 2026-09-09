import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './page'

// 同 accounts/page.test.tsx：page 層測試直接 mock RTK Query hook 的回傳值來驗證表單/流程邏輯
// （真實 HTTP mock 走各自 lib/api/*.test.ts，→ FE-012）。

const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/settings',
}))

const dispatch = vi.fn()
vi.mock('react-redux', () => ({
  useDispatch: () => dispatch,
}))

const useGetMeQuery = vi.fn()
const setPin = vi.fn()
const useSetPinMutation = vi.fn()
const changePin = vi.fn()
const useChangePinMutation = vi.fn()
const deletePin = vi.fn()
const useDeletePinMutation = vi.fn()
vi.mock('@/lib/api/authApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/authApi')>('@/lib/api/authApi')
  return {
    getAuthErrorMessage: actual.getAuthErrorMessage,
    useGetMeQuery: () => useGetMeQuery(),
    useSetPinMutation: () => useSetPinMutation(),
    useChangePinMutation: () => useChangePinMutation(),
    useDeletePinMutation: () => useDeletePinMutation(),
  }
})

const useListAccountsQuery = vi.fn()
vi.mock('@/lib/api/accountsApi', () => ({
  useListAccountsQuery: () => useListAccountsQuery(),
}))

const ME = { user_uid: 'u-1', email: 'j1025178@gmail.com' }

const CASH_ACCOUNT = {
  account_uid: 'a-cash',
  name: '現金',
  balance: '1000.00',
  currency: 'TWD',
  color: '#8B6ED6',
  icon: 'wallet',
}
const BANK_ACCOUNT = {
  account_uid: 'a-bank',
  name: '銀行',
  balance: '5000.00',
  currency: 'TWD',
  color: '#E8834B',
  icon: 'bank',
}

// NumericKeypad / Dialog 依賴 useReducedMotion()，jsdom 預設沒有 matchMedia，需手動 stub
// （同 accounts/page.test.tsx / PinLoginPad.test.tsx 慣例）。
function stubMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: false,
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

describe('SettingsPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    window.localStorage.clear()

    useGetMeQuery.mockReset().mockReturnValue({ data: ME, isLoading: false, isError: false })

    setPin.mockReset()
    useSetPinMutation.mockReset().mockReturnValue([setPin, { isLoading: false }])

    changePin.mockReset()
    useChangePinMutation.mockReset().mockReturnValue([changePin, { isLoading: false }])

    deletePin.mockReset()
    useDeletePinMutation.mockReset().mockReturnValue([deletePin, { isLoading: false }])

    useListAccountsQuery.mockReset().mockReturnValue({
      data: { items: [CASH_ACCOUNT, BANK_ACCOUNT], total: 2 },
      isLoading: false,
      error: undefined,
    })

    push.mockReset()
    dispatch.mockReset()
  })

  it('顯示唯讀 email', () => {
    render(<SettingsPage />)
    expect(screen.getByText(ME.email)).toBeInTheDocument()
  })

  describe('未設定 PIN', () => {
    it('顯示「設定 PIN」，不顯示「變更 PIN」/「停用」', () => {
      render(<SettingsPage />)
      expect(screen.getByRole('button', { name: '設定 PIN' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '變更 PIN' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '停用 PIN 快速登入' })).not.toBeInTheDocument()
    })

    it('點擊「設定 PIN」需先輸入目前密碼，尚未顯示數字鍵盤', () => {
      render(<SettingsPage />)
      fireEvent.click(screen.getByRole('button', { name: '設定 PIN' }))
      expect(screen.getByText('請先輸入目前密碼以驗證身份')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '數字 1' })).not.toBeInTheDocument()
    })

    it('輸入密碼 → 兩次輸入一致的 PIN，呼叫 setPin({pin, password}) 並切換為已設定狀態', async () => {
      setPin.mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
      render(<SettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: '設定 PIN' }))
      fireEvent.change(screen.getByLabelText('請先輸入目前密碼以驗證身份'), {
        target: { value: 'my-password' },
      })
      fireEvent.click(screen.getByRole('button', { name: '下一步' }))

      await typePin('123456')
      await typePin('123456')

      expect(setPin).toHaveBeenCalledExactlyOnceWith({ pin: '123456', password: 'my-password' })
      expect(await screen.findByRole('button', { name: '變更 PIN' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '停用 PIN 快速登入' })).toBeInTheDocument()
      expect(window.localStorage.getItem(`pin-status:${ME.user_uid}`)).toBe('set')
    })

    it('設定 PIN 成功後呼叫 rememberAccount，device-accounts 記住該帳號（task-031）', async () => {
      setPin.mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
      render(<SettingsPage />)

      fireEvent.click(screen.getByRole('button', { name: '設定 PIN' }))
      fireEvent.change(screen.getByLabelText('請先輸入目前密碼以驗證身份'), {
        target: { value: 'my-password' },
      })
      fireEvent.click(screen.getByRole('button', { name: '下一步' }))

      await typePin('123456')
      await typePin('123456')

      await screen.findByRole('button', { name: '變更 PIN' })
      const raw = window.localStorage.getItem('device-accounts')
      expect(raw).not.toBeNull()
      const stored = JSON.parse(raw ?? '[]') as Array<{ user_uid: string; maskedEmail: string }>
      expect(stored).toEqual([expect.objectContaining({ user_uid: ME.user_uid, maskedEmail: 'j***8@gmail.com' })])
    })

    it('兩次輸入的 PIN 不一致時顯示錯誤，不呼叫 setPin', async () => {
      render(<SettingsPage />)
      fireEvent.click(screen.getByRole('button', { name: '設定 PIN' }))
      fireEvent.change(screen.getByLabelText('請先輸入目前密碼以驗證身份'), {
        target: { value: 'my-password' },
      })
      fireEvent.click(screen.getByRole('button', { name: '下一步' }))

      await typePin('111111')
      await typePin('222222')

      expect(screen.getByRole('alert')).toHaveTextContent('兩次輸入的 PIN 不一致')
      expect(setPin).not.toHaveBeenCalled()
    })
  })

  describe('已設定 PIN', () => {
    beforeEach(() => {
      window.localStorage.setItem(`pin-status:${ME.user_uid}`, 'set')
    })

    it('顯示「變更 PIN」與「停用 PIN 快速登入」，不顯示「設定 PIN」', () => {
      render(<SettingsPage />)
      expect(screen.getByRole('button', { name: '變更 PIN' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '停用 PIN 快速登入' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '設定 PIN' })).not.toBeInTheDocument()
    })

    it('點擊「變更 PIN」需先輸入舊 PIN（數字鍵盤），非密碼輸入框', () => {
      render(<SettingsPage />)
      fireEvent.click(screen.getByRole('button', { name: '變更 PIN' }))
      expect(screen.getByText('請輸入目前的 6 碼 PIN')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '數字 1' })).toBeInTheDocument()
    })

    it('輸入舊 PIN 與新 PIN，呼叫 changePin({current_pin, new_pin})', async () => {
      changePin.mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
      render(<SettingsPage />)
      fireEvent.click(screen.getByRole('button', { name: '變更 PIN' }))

      await typePin('111111')
      await typePin('222222')

      expect(changePin).toHaveBeenCalledExactlyOnceWith({ current_pin: '111111', new_pin: '222222' })
    })

    it('點擊「停用 PIN 快速登入」需輸入目前密碼', () => {
      render(<SettingsPage />)
      fireEvent.click(screen.getByRole('button', { name: '停用 PIN 快速登入' }))
      expect(screen.getByLabelText('請輸入目前密碼以驗證身份')).toBeInTheDocument()
    })

    it('輸入密碼停用成功後，呼叫 deletePin({password}) 並切換回未設定狀態', async () => {
      deletePin.mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
      render(<SettingsPage />)
      fireEvent.click(screen.getByRole('button', { name: '停用 PIN 快速登入' }))
      fireEvent.change(screen.getByLabelText('請輸入目前密碼以驗證身份'), {
        target: { value: 'my-password' },
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '停用' }))
      })

      expect(deletePin).toHaveBeenCalledExactlyOnceWith({ password: 'my-password' })
      expect(await screen.findByRole('button', { name: '設定 PIN' })).toBeInTheDocument()
      expect(window.localStorage.getItem(`pin-status:${ME.user_uid}`)).toBeNull()
    })
  })

  it('外觀切換寫回 localStorage', () => {
    render(<SettingsPage />)
    expect(window.localStorage.getItem('theme-preference')).toBeNull()
    // <Sidebar> 也有自己的 <ThemeToggle>（→ 登出按鈕同一批 AppShell 補丁），限定在本頁自己的
    // <main> 內找，避免撞到 Sidebar 那顆。
    const settingsMain = screen.getByRole('heading', { name: '設定' }).closest('main') as HTMLElement
    fireEvent.click(within(settingsMain).getByRole('button', { name: /外觀：/ }))
    expect(window.localStorage.getItem('theme-preference')).toBe('light')
  })

  it('選擇預設記帳帳戶寫回 localStorage', () => {
    render(<SettingsPage />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: BANK_ACCOUNT.account_uid } })
    expect(window.localStorage.getItem('default-account-uid')).toBe(BANK_ACCOUNT.account_uid)
  })

  it('點擊登出導向 /login 並清空 RTK Query 快取', () => {
    render(<SettingsPage />)
    // 補上 <AppShell> 後 <Sidebar>/<BottomNav> 也各自有一顆「登出」，全站可從任何頁面登出
    // （→ 部分頁面返回按鈕修復）；本頁自己那顆是設定頁內容區域裡唯一一顆，用 h1 找到
    // SettingsPageContent 自己的 <main> 再限定查詢範圍，不受 Sidebar 的「登出」影響。
    const settingsMain = screen.getByRole('heading', { name: '設定' }).closest('main') as HTMLElement
    fireEvent.click(within(settingsMain).getByRole('button', { name: '登出' }))
    expect(push).toHaveBeenCalledExactlyOnceWith('/login')
    expect(dispatch).toHaveBeenCalledOnce()
  })
})
