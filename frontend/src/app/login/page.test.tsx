import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './page'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}))

const login = vi.fn()
const useLoginMutation = vi.fn()
vi.mock('@/lib/api/authApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/authApi')>('@/lib/api/authApi')
  return {
    getAuthErrorMessage: actual.getAuthErrorMessage,
    useLoginMutation: () => useLoginMutation(),
  }
})

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockClear()
    login
      .mockReset()
      .mockReturnValue({ unwrap: () => Promise.resolve({ user_uid: 'u1', email: 'a@b.com' }) })
    useLoginMutation.mockReturnValue([login, { isLoading: false, error: undefined }])
  })

  it('送出表單觸發 login mutation，成功後導向 /transactions', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'password123' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '登入' }))
    })

    expect(login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password123' })
    expect(push).toHaveBeenCalledWith('/transactions')
  })

  it('mutation 回錯誤時顯示錯誤訊息，不導向', () => {
    useLoginMutation.mockReturnValue([
      login,
      { isLoading: false, error: { status: 401, data: { detail: '帳號或密碼錯誤' } } },
    ])
    render(<LoginPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('帳號或密碼錯誤')
    expect(push).not.toHaveBeenCalled()
  })
})
