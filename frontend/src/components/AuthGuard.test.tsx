import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthGuard } from './AuthGuard'

const replace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}))

// msw 尚未成為 devDependency（package.json 未列，只在 allowScripts 預先核可，見 authApi.ts
// 頂部註解），故直接 mock RTK Query hook 的回傳值來驗證導向邏輯，而非起假 HTTP server。
const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

describe('AuthGuard', () => {
  beforeEach(() => {
    replace.mockClear()
    useGetMeQuery.mockReset()
  })

  it('未登入（GET /auth/me 失敗）時導向 /login，不 render children', () => {
    useGetMeQuery.mockReturnValue({ isLoading: false, isError: true })
    render(
      <AuthGuard>
        <p>secret</p>
      </AuthGuard>,
    )
    expect(replace).toHaveBeenCalledWith('/login')
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('載入中時不導向、也不 render children', () => {
    useGetMeQuery.mockReturnValue({ isLoading: true, isError: false })
    render(
      <AuthGuard>
        <p>secret</p>
      </AuthGuard>,
    )
    expect(replace).not.toHaveBeenCalled()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('已登入時 render children、不導向', () => {
    useGetMeQuery.mockReturnValue({ isLoading: false, isError: false })
    render(
      <AuthGuard>
        <p>secret</p>
      </AuthGuard>,
    )
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})
