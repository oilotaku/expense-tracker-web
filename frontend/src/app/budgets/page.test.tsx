import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BudgetsPage from './page'

// 同 TransactionForm.test.tsx / AuthGuard.test.tsx：msw 尚未成為 devDependency，直接 mock
// RTK Query hook 的回傳值，而非起假 HTTP server。
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}))

const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

const useListCategoryOptionsQuery = vi.fn()
vi.mock('@/lib/api/transactionsApi', () => ({
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
}))

const createBudget = vi.fn()
const useCreateBudgetMutation = vi.fn()
const useListBudgetsQuery = vi.fn()
const useGetBudgetSummaryQuery = vi.fn()
vi.mock('@/lib/api/budgetsApi', () => ({
  useCreateBudgetMutation: () => useCreateBudgetMutation(),
  useListBudgetsQuery: () => useListBudgetsQuery(),
  useGetBudgetSummaryQuery: (budgetUid: string) => useGetBudgetSummaryQuery(budgetUid),
}))

const CATEGORY = { category_uid: 'c1', name: '餐飲' }

const BUDGET_MONTHLY = {
  budget_uid: 'b1',
  category_uid: 'c1',
  period_type: 'monthly',
  limit_amount: '3000.00',
}

describe('BudgetsPage', () => {
  beforeEach(() => {
    replace.mockClear()
    useGetMeQuery.mockReset().mockReturnValue({ isLoading: false, isError: false })
    useListCategoryOptionsQuery.mockReset().mockReturnValue({ data: [CATEGORY] })
    createBudget.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...BUDGET_MONTHLY }),
    })
    useCreateBudgetMutation.mockReset().mockReturnValue([
      createBudget,
      { isLoading: false, error: undefined },
    ])
    useListBudgetsQuery.mockReset().mockReturnValue({
      data: { items: [BUDGET_MONTHLY], total: 1 },
      isLoading: false,
      error: undefined,
    })
    useGetBudgetSummaryQuery.mockReset()
  })

  it('送出表單觸發 createBudget mutation', async () => {
    useGetBudgetSummaryQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    })
    render(<BudgetsPage />)

    fireEvent.change(screen.getByLabelText('分類'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText('期間'), { target: { value: 'daily' } })
    fireEvent.change(screen.getByLabelText('上限金額'), { target: { value: '500' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增預算' }))
    })

    expect(createBudget).toHaveBeenCalledTimes(1)
    expect(createBudget).toHaveBeenCalledWith({
      category_uid: 'c1',
      period_type: 'daily',
      limit_amount: '500',
    })
  })

  it('新增預算失敗時顯示錯誤訊息', () => {
    useCreateBudgetMutation.mockReturnValue([
      createBudget,
      { isLoading: false, error: { status: 409, data: { detail: '此分類已存在同期間類型的預算' } } },
    ])
    useGetBudgetSummaryQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    })
    render(<BudgetsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('此分類已存在同期間類型的預算')
  })

  it('尚未超支時進度條顯示一般樣式，不顯示已超支文字', () => {
    useGetBudgetSummaryQuery.mockReturnValue({
      data: {
        budget_uid: 'b1',
        category_uid: 'c1',
        period_type: 'monthly',
        limit_amount: '3000.00',
        spent_amount: '1200.00',
        remaining_amount: '1800.00',
        is_over_budget: false,
      },
      isLoading: false,
      error: undefined,
    })
    render(<BudgetsPage />)

    // '餐飲' 同時出現在分類下拉選項與進度卡片，故用 getAllByText 確認至少有卡片顯示
    expect(screen.getAllByText('餐飲').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('已花費 1200.00 / 上限 3000.00')).toBeInTheDocument()
    expect(screen.getByText('剩餘 1800.00')).toBeInTheDocument()
    expect(screen.queryByText(/已超支/)).not.toBeInTheDocument()
    expect(screen.getByTestId('budget-progress-bar')).toHaveClass('bg-blue-600')
    expect(screen.getByTestId('budget-progress-bar')).not.toHaveClass('bg-red-600')
  })

  it('超支時進度條顯示警示樣式並標示已超支', () => {
    useGetBudgetSummaryQuery.mockReturnValue({
      data: {
        budget_uid: 'b1',
        category_uid: 'c1',
        period_type: 'monthly',
        limit_amount: '3000.00',
        spent_amount: '3500.00',
        remaining_amount: '-500.00',
        is_over_budget: true,
      },
      isLoading: false,
      error: undefined,
    })
    render(<BudgetsPage />)

    const bar = screen.getByTestId('budget-progress-bar')
    expect(bar).toHaveClass('bg-red-600')
    expect(bar).not.toHaveClass('bg-blue-600')
    const overBudgetText = screen.getByText('已超支 -500.00')
    expect(overBudgetText).toBeInTheDocument()
    expect(overBudgetText).toHaveAttribute('role', 'alert')
  })

  it('尚未設定預算時顯示提示文字', () => {
    useListBudgetsQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: undefined,
    })
    render(<BudgetsPage />)
    expect(screen.getByText('尚未設定預算')).toBeInTheDocument()
  })
})
