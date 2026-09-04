import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceAccount } from '@/hooks/useDeviceAccounts'
import { PinLoginPad } from './PinLoginPad'

const loginWithPin = vi.fn()
const useLoginWithPinMutation = vi.fn()
vi.mock('@/lib/api/authApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/authApi')>('@/lib/api/authApi')
  return {
    getAuthErrorMessage: actual.getAuthErrorMessage,
    useLoginWithPinMutation: () => useLoginWithPinMutation(),
  }
})

const ACCOUNT: DeviceAccount = {
  user_uid: '11111111-1111-1111-1111-111111111111',
  maskedEmail: 'j***8@gmail.com',
  displayName: 'j1025178',
  avatarColor: '#8257D6',
}

// NumericKeypad 依賴 useReducedMotion()，jsdom 預設沒有 matchMedia，需手動 stub（同
// NumericKeypad.test.tsx / TransactionFormDialog.test.tsx 慣例）。
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

describe('PinLoginPad', () => {
  beforeEach(() => {
    stubMatchMedia()
    loginWithPin.mockReset()
    useLoginWithPinMutation.mockReturnValue([loginWithPin, { isLoading: false }])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('render 出已選帳號的遮罩 email', () => {
    render(<PinLoginPad account={ACCOUNT} onSuccess={vi.fn()} onSwitchToPassword={vi.fn()} />)
    expect(screen.getByText('j***8@gmail.com')).toBeInTheDocument()
  })

  it('輸入滿 6 碼自動呼叫 loginWithPin 並在成功時觸發 onSuccess', async () => {
    const user = { user_uid: ACCOUNT.user_uid, email: 'j1025178@gmail.com' }
    loginWithPin.mockReturnValue({ unwrap: () => Promise.resolve(user) })
    const onSuccess = vi.fn()
    render(<PinLoginPad account={ACCOUNT} onSuccess={onSuccess} onSwitchToPassword={vi.fn()} />)

    await typePin('123456')

    expect(loginWithPin).toHaveBeenCalledExactlyOnceWith({ user_uid: ACCOUNT.user_uid, pin: '123456' })
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(user)
  })

  it('PIN 錯誤（401）顯示錯誤訊息，不呼叫 onSuccess，且清空輸入', async () => {
    loginWithPin.mockReturnValue({
      unwrap: () => Promise.reject({ status: 401, data: { detail: 'PIN 錯誤' } }),
    })
    const onSuccess = vi.fn()
    render(<PinLoginPad account={ACCOUNT} onSuccess={onSuccess} onSwitchToPassword={vi.fn()} />)

    await typePin('000000')

    expect(screen.getByRole('alert')).toHaveTextContent('PIN 錯誤')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(screen.getByLabelText('PIN')).toHaveValue('')
  })

  it('鎖定（429）顯示改用密碼登入提示', async () => {
    loginWithPin.mockReturnValue({
      unwrap: () =>
        Promise.reject({ status: 429, data: { detail: 'PIN 已鎖定，請改用密碼登入或稍後再試' } }),
    })
    render(<PinLoginPad account={ACCOUNT} onSuccess={vi.fn()} onSwitchToPassword={vi.fn()} />)

    await typePin('123456')

    expect(screen.getByRole('alert')).toHaveTextContent('PIN 已鎖定，請改用密碼登入或稍後再試')
  })

  it('點擊「改用密碼登入」觸發 onSwitchToPassword', () => {
    const onSwitchToPassword = vi.fn()
    render(<PinLoginPad account={ACCOUNT} onSuccess={vi.fn()} onSwitchToPassword={onSwitchToPassword} />)

    fireEvent.click(screen.getByRole('button', { name: '改用密碼登入' }))

    expect(onSwitchToPassword).toHaveBeenCalledOnce()
  })
})
