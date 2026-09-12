import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPage from './page'

// 同 accounts/page.test.tsx：page 層測試直接 mock RTK Query hook 的回傳值。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin',
}))

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

const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

const deleteUser = vi.fn()
const resetPassword = vi.fn()
const useListAdminUsersQuery = vi.fn()
const useDeleteAdminUserMutation = vi.fn()
const useResetAdminUserPasswordMutation = vi.fn()
vi.mock('@/lib/api/adminApi', () => ({
  useListAdminUsersQuery: () => useListAdminUsersQuery(),
  useDeleteAdminUserMutation: () => useDeleteAdminUserMutation(),
  useResetAdminUserPasswordMutation: () => useResetAdminUserPasswordMutation(),
}))

const ADMIN_ME = { user_uid: 'u-admin', email: 'admin@example.com', is_admin: true }
const MEMBER: AdminUserListItemForTest = {
  user_uid: 'u-member',
  email: 'member@example.com',
  created_at: '2026-09-01T00:00:00Z',
  account_count: 2,
  transaction_count: 5,
  last_login_at: '2026-09-10T08:30:00Z',
}

const NEVER_LOGGED_IN: AdminUserListItemForTest = {
  user_uid: 'u-never',
  email: 'never@example.com',
  created_at: '2026-09-01T00:00:00Z',
  account_count: 2,
  transaction_count: 0,
  last_login_at: null,
}

interface AdminUserListItemForTest {
  user_uid: string
  email: string
  created_at: string
  account_count: number
  transaction_count: number
  last_login_at: string | null
}

describe('AdminPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    useGetMeQuery.mockReset().mockReturnValue({ data: ADMIN_ME, isLoading: false, isError: false })
    useListAdminUsersQuery
      .mockReset()
      .mockReturnValue({ data: { items: [MEMBER], total: 1 }, isLoading: false, error: undefined })

    deleteUser.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
    useDeleteAdminUserMutation.mockReset().mockReturnValue([deleteUser, { isLoading: false }])

    resetPassword
      .mockReset()
      .mockReturnValue({ unwrap: () => Promise.resolve({ temporary_password: 'temp-abc123' }) })
    useResetAdminUserPasswordMutation.mockReset().mockReturnValue([resetPassword, { isLoading: false }])
  })

  it('render 使用者清單，含帳戶/交易數量', () => {
    render(<AdminPage />)
    expect(screen.getByText('member@example.com')).toBeInTheDocument()
    expect(screen.getByText(/2 個帳戶・5 筆交易/)).toBeInTheDocument()
  })

  it('render 最後登入時間；從未登入顯示「從未登入」（task-038）', () => {
    useListAdminUsersQuery.mockReturnValue({
      data: { items: [MEMBER, NEVER_LOGGED_IN], total: 2 },
      isLoading: false,
      error: undefined,
    })
    render(<AdminPage />)
    expect(screen.getByText(/最後登入：2026/)).toBeInTheDocument()
    expect(screen.getByText(/最後登入：從未登入/)).toBeInTheDocument()
  })

  it('is_admin=false 時顯示沒有權限，不 render 使用者清單', () => {
    useGetMeQuery.mockReturnValue({
      data: { ...ADMIN_ME, is_admin: false },
      isLoading: false,
      isError: false,
    })
    render(<AdminPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('沒有權限')
    expect(screen.queryByText('member@example.com')).not.toBeInTheDocument()
  })

  it('點刪除走 ConfirmDialog，確認後呼叫 deleteUser', async () => {
    render(<AdminPage />)
    fireEvent.click(screen.getByLabelText('刪除 member@example.com'))
    expect(screen.getByText('刪除「member@example.com」？')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    })
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith('u-member')
  })

  it('點重設密碼呼叫 resetPassword，成功後顯示臨時密碼', async () => {
    render(<AdminPage />)
    await act(async () => {
      fireEvent.click(screen.getByLabelText('重設密碼 member@example.com'))
    })
    expect(resetPassword).toHaveBeenCalledExactlyOnceWith('u-member')
    expect(screen.getByDisplayValue('temp-abc123')).toBeInTheDocument()
  })
})
