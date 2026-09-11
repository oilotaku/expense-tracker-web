import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChangePasswordPage from './page'

const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/change-password',
}))

const useGetMeQuery = vi.fn()
const changePassword = vi.fn()
const useChangePasswordMutation = vi.fn()
vi.mock('@/lib/api/authApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/authApi')>('@/lib/api/authApi')
  return {
    getAuthErrorMessage: actual.getAuthErrorMessage,
    useGetMeQuery: () => useGetMeQuery(),
    useChangePasswordMutation: () => useChangePasswordMutation(),
  }
})

const ME = { user_uid: 'u-1', email: 'member@example.com', must_change_password: true }

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    useGetMeQuery.mockReset().mockReturnValue({ data: ME, isLoading: false, isError: false })
    changePassword.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
    useChangePasswordMutation.mockReset().mockReturnValue([changePassword, { isLoading: false }])
    replace.mockReset()
  })

  it('送出表單呼叫 changePassword，成功後導向 /dashboard', async () => {
    render(<ChangePasswordPage />)

    fireEvent.change(screen.getByLabelText('目前密碼（臨時密碼）'), {
      target: { value: 'temp-password-123' },
    })
    fireEvent.change(screen.getByLabelText('新密碼'), {
      target: { value: 'a-brand-new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: '設定新密碼' }))

    await vi.waitFor(() => {
      expect(changePassword).toHaveBeenCalledExactlyOnceWith({
        current_password: 'temp-password-123',
        new_password: 'a-brand-new-password',
      })
    })
    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledExactlyOnceWith('/dashboard')
    })
  })

  it('改密碼失敗時顯示錯誤訊息，不導向', async () => {
    // 同 register/page.test.tsx 慣例：mutation hook 的 error 狀態直接在 mock 回傳值裡給定
    // （模擬「送出後 RTK Query 已把 error 灌回這次 render」的狀態），而不是靠 unwrap() 的
    // rejection（那個只負責擋掉 handleSubmit 內的例外，不驅動畫面上的錯誤訊息）。
    changePassword.mockReturnValue({ unwrap: () => Promise.reject(new Error('rejected')) })
    useChangePasswordMutation.mockReturnValue([
      changePassword,
      { isLoading: false, error: { status: 401, data: { detail: '帳號或密碼錯誤' } } },
    ])
    render(<ChangePasswordPage />)

    fireEvent.change(screen.getByLabelText('目前密碼（臨時密碼）'), {
      target: { value: 'wrong-password' },
    })
    fireEvent.change(screen.getByLabelText('新密碼'), {
      target: { value: 'a-brand-new-password' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('帳號或密碼錯誤')
    expect(replace).not.toHaveBeenCalled()
  })
})
