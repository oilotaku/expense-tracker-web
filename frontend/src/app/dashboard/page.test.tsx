import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './page'

// 同 BudgetsPage.test.tsx / AuthGuard.test.tsx：msw 尚未成為 devDependency（frontend/package.json
// 只在 allowScripts 預先核可，未列入 devDependencies），直接 mock RTK Query hook 的回傳值，而非
// 起假 HTTP server（見 budgets/page.test.tsx 頂部同一備註）。task-017 Acceptance 要求涵蓋的
// 「dashboard 數字渲染、mock net-worth API 回應」由此達成。
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}))

const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

const refetch = vi.fn()
const useGetNetWorthQuery = vi.fn()
vi.mock('@/lib/api/assetsApi', () => ({
  useGetNetWorthQuery: () => useGetNetWorthQuery(),
}))

const NET_WORTH = {
  total_assets: '150000.00',
  total_liabilities: '50000.00',
  net_worth: '100000.00',
}

describe('DashboardPage', () => {
  beforeEach(() => {
    replace.mockClear()
    refetch.mockClear()
    useGetMeQuery.mockReset().mockReturnValue({ isLoading: false, isError: false })
    useGetNetWorthQuery.mockReset()
  })

  it('載入中時顯示載入提示，不顯示數字', () => {
    useGetNetWorthQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
      refetch,
    })
    render(<DashboardPage />)
    expect(screen.getByText('載入中…')).toBeInTheDocument()
    expect(screen.queryByText('總資產')).not.toBeInTheDocument()
  })

  it('取得淨資產彙總後顯示總資產／總負債／淨資產數字', () => {
    useGetNetWorthQuery.mockReturnValue({
      data: NET_WORTH,
      isLoading: false,
      error: undefined,
      refetch,
    })
    render(<DashboardPage />)

    expect(screen.getByText('總資產')).toBeInTheDocument()
    expect(screen.getByText('150000.00')).toBeInTheDocument()
    expect(screen.getByText('總負債')).toBeInTheDocument()
    expect(screen.getByText('50000.00')).toBeInTheDocument()
    expect(screen.getByText('淨資產')).toBeInTheDocument()
    expect(screen.getByText('100000.00')).toBeInTheDocument()
  })

  it('報價服務回 424 時顯示可重試提示，不當一般錯誤處理', () => {
    useGetNetWorthQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { status: 424, data: { detail: '報價服務暫時無法使用，請稍後再試' } },
      refetch,
    })
    render(<DashboardPage />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      '報價服務暫時無法使用，總資產 / 淨資產暫時無法計算，請稍後再試。',
    )
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('一般錯誤（非 424）時顯示錯誤訊息', () => {
    useGetNetWorthQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { status: 500, data: { detail: '伺服器錯誤' } },
      refetch,
    })
    render(<DashboardPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('伺服器錯誤')
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()
  })
})
