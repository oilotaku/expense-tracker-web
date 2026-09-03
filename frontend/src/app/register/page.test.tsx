import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegisterPage from './page'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}))

const register = vi.fn()
const useRegisterMutation = vi.fn()
vi.mock('@/lib/api/authApi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/authApi')>('@/lib/api/authApi')
  return {
    getAuthErrorMessage: actual.getAuthErrorMessage,
    useRegisterMutation: () => useRegisterMutation(),
  }
})

describe('RegisterPage', () => {
  beforeEach(() => {
    push.mockClear()
    register
      .mockReset()
      .mockReturnValue({ unwrap: () => Promise.resolve({ user_uid: 'u1', email: 'a@b.com' }) })
    useRegisterMutation.mockReturnValue([register, { isLoading: false, error: undefined }])
  })

  it('送出表單觸發 register mutation，成功後導向 /login', async () => {
    render(<RegisterPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'password123' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '註冊' }))
    })

    expect(register).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password123' })
    expect(push).toHaveBeenCalledWith('/login')
  })

  it('mutation 回錯誤時顯示錯誤訊息，不導向', () => {
    useRegisterMutation.mockReturnValue([
      register,
      { isLoading: false, error: { status: 400, data: { detail: 'email 已被註冊' } } },
    ])
    render(<RegisterPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('email 已被註冊')
    expect(push).not.toHaveBeenCalled()
  })
})
