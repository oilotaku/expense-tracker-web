import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RecurringRulesPage from './page'

// 同 TransactionForm.test.tsx / AuthGuard.test.tsx：msw 尚未成為 devDependency，直接 mock RTK
// Query hook 的回傳值來驗證表單 / 清單邏輯，而非起假 HTTP server。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

const createRecurringRule = vi.fn()
const useCreateRecurringRuleMutation = vi.fn()
const useListRecurringRulesQuery = vi.fn()
vi.mock('@/lib/api/recurringApi', () => ({
  useCreateRecurringRuleMutation: () => useCreateRecurringRuleMutation(),
  useListRecurringRulesQuery: () => useListRecurringRulesQuery(),
}))

const useListAccountOptionsQuery = vi.fn()
const useListCategoryOptionsQuery = vi.fn()
vi.mock('@/lib/api/transactionsApi', () => ({
  useListAccountOptionsQuery: () => useListAccountOptionsQuery(),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
}))

describe('RecurringRulesPage', () => {
  beforeEach(() => {
    useGetMeQuery.mockReturnValue({ isLoading: false, isError: false })

    createRecurringRule.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ recurring_rule_uid: 'r1' }),
    })
    useCreateRecurringRuleMutation.mockReturnValue([
      createRecurringRule,
      { isLoading: false, error: undefined },
    ])
    useListRecurringRulesQuery.mockReturnValue({
      data: {
        items: [
          {
            recurring_rule_uid: 'r1',
            account_uid: 'a1',
            category_uid: 'c1',
            description: '房租',
            amount: '15000.00',
            transaction_type: 'expense',
            payment_method: '轉帳',
            day_of_month: 5,
            last_generated_year_month: null,
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: undefined,
    })
    useListAccountOptionsQuery.mockReturnValue({
      data: [{ account_uid: 'a1', name: '銀行帳戶', balance: '1000.00', currency: 'TWD' }],
    })
    useListCategoryOptionsQuery.mockReturnValue({
      data: [{ category_uid: 'c1', name: '居住' }],
    })
  })

  function fillValidForm(): void {
    fireEvent.change(screen.getByLabelText('分類'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText('帳戶'), { target: { value: 'a1' } })
    fireEvent.change(screen.getByLabelText('說明'), { target: { value: '房租' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '15000' } })
    fireEvent.change(screen.getByLabelText('支付方式'), { target: { value: '轉帳' } })
  }

  it('render 週期性交易規則清單，含帳戶 / 分類名稱', () => {
    render(<RecurringRulesPage />)
    const row = screen.getByText('房租').closest('tr')
    expect(row).not.toBeNull()
    expect(row).toHaveTextContent('銀行帳戶')
    expect(row).toHaveTextContent('居住')
    expect(row).toHaveTextContent('5')
  })

  it('清單為空時顯示提示文字', () => {
    useListRecurringRulesQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: undefined,
    })
    render(<RecurringRulesPage />)
    expect(screen.getByText('尚未設定任何週期性交易規則')).toBeInTheDocument()
  })

  it('送出合法表單觸發 createRecurringRule mutation，day_of_month 轉為數字', async () => {
    render(<RecurringRulesPage />)
    fillValidForm()
    fireEvent.change(screen.getByLabelText('每月第幾天（1–31）'), { target: { value: '15' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增規則' }))
    })

    expect(createRecurringRule).toHaveBeenCalledTimes(1)
    expect(createRecurringRule).toHaveBeenCalledWith({
      account_uid: 'a1',
      category_uid: 'c1',
      description: '房租',
      amount: '15000',
      transaction_type: 'expense',
      payment_method: '轉帳',
      day_of_month: 15,
    })
  })

  it('每月第幾天為 0 時拒絕送出並顯示錯誤訊息', async () => {
    render(<RecurringRulesPage />)
    fillValidForm()
    fireEvent.change(screen.getByLabelText('每月第幾天（1–31）'), { target: { value: '0' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增規則' }))
    })

    expect(createRecurringRule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('每月第幾天必須介於 1 到 31 之間')
  })

  it('每月第幾天大於 31 時拒絕送出並顯示錯誤訊息', async () => {
    render(<RecurringRulesPage />)
    fillValidForm()
    fireEvent.change(screen.getByLabelText('每月第幾天（1–31）'), { target: { value: '32' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增規則' }))
    })

    expect(createRecurringRule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('每月第幾天必須介於 1 到 31 之間')
  })

  it('mutation 回錯誤時顯示錯誤訊息', () => {
    useCreateRecurringRuleMutation.mockReturnValue([
      createRecurringRule,
      { isLoading: false, error: { status: 400, data: { detail: '帳戶不存在' } } },
    ])
    render(<RecurringRulesPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('帳戶不存在')
  })
})
