import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RecurringRulesPage from './page'

// 同 TransactionForm.test.tsx / AuthGuard.test.tsx / budgets/page.test.tsx（task-023）：msw 尚未成為
// devDependency，直接 mock RTK Query hook 的回傳值來驗證表單 / 清單邏輯，而非起假 HTTP server。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/recurring',
}))

// <AppShell> 內的 <BottomNav>「更多」<Dialog> 依賴 useReducedMotion()，jsdom 預設沒有
// matchMedia（同 accounts/page.test.tsx / categories/page.test.tsx 的作法）。
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

const createRecurringRule = vi.fn()
const useCreateRecurringRuleMutation = vi.fn()
const updateRecurringRule = vi.fn()
const useUpdateRecurringRuleMutation = vi.fn()
const deleteRecurringRule = vi.fn()
const useDeleteRecurringRuleMutation = vi.fn()
const useListRecurringRulesQuery = vi.fn()
vi.mock('@/lib/api/recurringApi', () => ({
  useCreateRecurringRuleMutation: () => useCreateRecurringRuleMutation(),
  useUpdateRecurringRuleMutation: () => useUpdateRecurringRuleMutation(),
  useDeleteRecurringRuleMutation: () => useDeleteRecurringRuleMutation(),
  useListRecurringRulesQuery: () => useListRecurringRulesQuery(),
}))

const useListAccountOptionsQuery = vi.fn()
const useListCategoryOptionsQuery = vi.fn()
vi.mock('@/lib/api/transactionsApi', () => ({
  useListAccountOptionsQuery: () => useListAccountOptionsQuery(),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
}))

const useListLiabilitiesQuery = vi.fn()
vi.mock('@/lib/api/assetsApi', () => ({
  useListLiabilitiesQuery: () => useListLiabilitiesQuery(),
}))

// 既有月規則資料（task-003 回填策略，design-spec §12.3）：interval_unit=month、interval_count=1，
// 維持升級前「每月第 N 天」語意（task-022 Acceptance）。
const MONTHLY_RULE = {
  recurring_rule_uid: 'r1',
  account_uid: 'a1',
  category_uid: 'c1',
  description: '房租',
  amount: '15000.00',
  transaction_type: 'expense',
  payment_method: '轉帳',
  interval_unit: 'month',
  interval_count: 1,
  anchor_date: '2026-08-05',
  last_generated_year_month: null,
}

describe('RecurringRulesPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    useGetMeQuery.mockReturnValue({ isLoading: false, isError: false })

    createRecurringRule.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ recurring_rule_uid: 'r1' }),
    })
    useCreateRecurringRuleMutation.mockReturnValue([
      createRecurringRule,
      { isLoading: false, error: undefined },
    ])
    updateRecurringRule.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ ...MONTHLY_RULE }),
    })
    useUpdateRecurringRuleMutation.mockReset().mockReturnValue([
      updateRecurringRule,
      { isLoading: false, error: undefined },
    ])
    deleteRecurringRule.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
    useDeleteRecurringRuleMutation.mockReset().mockReturnValue([
      deleteRecurringRule,
      { isLoading: false, error: undefined },
    ])
    useListRecurringRulesQuery.mockReturnValue({
      data: { items: [MONTHLY_RULE], total: 1 },
      isLoading: false,
      error: undefined,
    })
    useListAccountOptionsQuery.mockReturnValue({
      data: [{ account_uid: 'a1', name: '銀行帳戶', balance: '1000.00', currency: 'TWD' }],
    })
    useListCategoryOptionsQuery.mockReturnValue({
      data: [{ category_uid: 'c1', name: '居住' }],
    })
    useListLiabilitiesQuery.mockReturnValue({ data: { items: [], total: 0 } })
  })

  function fillValidForm(): void {
    fireEvent.change(screen.getByLabelText('分類'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText('帳戶'), { target: { value: 'a1' } })
    fireEvent.change(screen.getByLabelText('說明'), { target: { value: '房租' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '15000' } })
    fireEvent.change(screen.getByLabelText('支付方式'), { target: { value: '轉帳' } })
    fireEvent.change(screen.getByLabelText('起算日'), { target: { value: '2026-09-05' } })
  }

  it('render 週期性交易規則清單，含帳戶 / 分類名稱，既有月規則顯示「每月第 N 天」語意（升級前一致）', () => {
    render(<RecurringRulesPage />)
    // 「房租」在卡片內層的 flex row（與 badge 並排），實際卡片容器是其父層
    const card = screen.getByText('房租').closest('div')?.parentElement
    expect(card).not.toBeNull()
    expect(card).toHaveTextContent('銀行帳戶')
    expect(card).toHaveTextContent('居住')
    expect(screen.getByText('每月第 5 天')).toBeInTheDocument()
  })

  it('interval_unit=week 且 interval_count 為 2 時顯示「每 2 週」', () => {
    useListRecurringRulesQuery.mockReturnValue({
      data: {
        items: [
          {
            ...MONTHLY_RULE,
            recurring_rule_uid: 'r2',
            description: '健身房',
            interval_unit: 'week',
            interval_count: 2,
            anchor_date: '2026-09-01',
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: undefined,
    })
    render(<RecurringRulesPage />)
    expect(screen.getByText('每 2 週')).toBeInTheDocument()
  })

  it('interval_unit=year 且 interval_count 為 1 時顯示「每年」', () => {
    useListRecurringRulesQuery.mockReturnValue({
      data: {
        items: [
          {
            ...MONTHLY_RULE,
            recurring_rule_uid: 'r3',
            description: '保險',
            interval_unit: 'year',
            interval_count: 1,
            anchor_date: '2026-01-10',
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: undefined,
    })
    render(<RecurringRulesPage />)
    expect(screen.getByText('每年')).toBeInTheDocument()
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

  it('送出合法表單觸發 createRecurringRule mutation，interval_unit/interval_count/anchor_date 一併送出', async () => {
    render(<RecurringRulesPage />)
    fillValidForm()
    fireEvent.change(screen.getByLabelText('週期單位'), { target: { value: 'week' } })
    fireEvent.change(screen.getByLabelText(/每幾個週執行一次/), { target: { value: '3' } })

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
      interval_unit: 'week',
      interval_count: 3,
      anchor_date: '2026-09-05',
    })
  })

  it('間隔數為 0 時拒絕送出並顯示錯誤訊息', async () => {
    render(<RecurringRulesPage />)
    fillValidForm()
    fireEvent.change(screen.getByLabelText(/每幾個月執行一次/), { target: { value: '0' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增規則' }))
    })

    expect(createRecurringRule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('間隔數必須介於 1 到 99 之間')
  })

  it('間隔數大於 99 時拒絕送出並顯示錯誤訊息', async () => {
    render(<RecurringRulesPage />)
    fillValidForm()
    fireEvent.change(screen.getByLabelText(/每幾個月執行一次/), { target: { value: '100' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增規則' }))
    })

    expect(createRecurringRule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('間隔數必須介於 1 到 99 之間')
  })

  it('未填起算日時拒絕送出並顯示錯誤訊息', async () => {
    render(<RecurringRulesPage />)
    fireEvent.change(screen.getByLabelText('分類'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText('帳戶'), { target: { value: 'a1' } })
    fireEvent.change(screen.getByLabelText('說明'), { target: { value: '房租' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '15000' } })
    fireEvent.change(screen.getByLabelText('支付方式'), { target: { value: '轉帳' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增規則' }))
    })

    expect(createRecurringRule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('請選擇起算日')
  })

  it('mutation 回錯誤時顯示錯誤訊息', () => {
    useCreateRecurringRuleMutation.mockReturnValue([
      createRecurringRule,
      { isLoading: false, error: { status: 400, data: { detail: '帳戶不存在' } } },
    ])
    render(<RecurringRulesPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('帳戶不存在')
  })

  it('點編輯展開表單並預填目前值，修改金額後儲存呼叫 updateRecurringRule', async () => {
    render(<RecurringRulesPage />)

    fireEvent.click(screen.getByLabelText('編輯 房租'))
    expect(screen.getByLabelText('房租 金額')).toHaveValue(15000)

    fireEvent.change(screen.getByLabelText('房租 金額'), { target: { value: '16000' } })

    await act(async () => {
      fireEvent.click(screen.getByLabelText('儲存 房租'))
    })

    expect(updateRecurringRule).toHaveBeenCalledExactlyOnceWith({
      recurring_rule_uid: 'r1',
      account_uid: 'a1',
      category_uid: 'c1',
      description: '房租',
      amount: '16000',
      transaction_type: 'expense',
      payment_method: '轉帳',
      interval_unit: 'month',
      interval_count: 1,
      anchor_date: '2026-08-05',
    })
  })

  it('取消編輯不呼叫 updateRecurringRule 並收起表單', () => {
    render(<RecurringRulesPage />)

    fireEvent.click(screen.getByLabelText('編輯 房租'))
    fireEvent.change(screen.getByLabelText('房租 金額'), { target: { value: '99999' } })
    fireEvent.click(screen.getByLabelText('取消編輯 房租'))

    expect(updateRecurringRule).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('房租 金額')).not.toBeInTheDocument()
  })

  it('刪除規則走 ConfirmDialog：點刪除按鈕開對話框，確認後才呼叫 deleteRecurringRule', async () => {
    render(<RecurringRulesPage />)

    fireEvent.click(screen.getByLabelText('刪除 房租'))
    expect(deleteRecurringRule).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '刪除' }))
    })

    expect(deleteRecurringRule).toHaveBeenCalledExactlyOnceWith('r1')
  })

  it('取消刪除對話框不呼叫 deleteRecurringRule', () => {
    render(<RecurringRulesPage />)

    fireEvent.click(screen.getByLabelText('刪除 房租'))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(deleteRecurringRule).not.toHaveBeenCalled()
  })
})
