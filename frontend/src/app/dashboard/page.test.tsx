import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './page'
import { defaultPeriodSelection, toPeriodRange } from '@/components/dashboard/PeriodSelector'
import type { DashboardSummaryResponse } from '@/lib/api/dashboardApi'

// 同 accounts/page.test.tsx / settings/page.test.tsx：page 層測試直接 mock RTK Query hook 的回傳
// 值來驗證頁面組裝邏輯（真實 HTTP mock 走各自 lib/api/*.test.ts，→ FE-012）。
const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/dashboard',
}))

const dispatch = vi.fn()
vi.mock('react-redux', () => ({
  useDispatch: () => dispatch,
}))

// <Dialog> / <NumericKeypad> / <ChartTypeSwitcher> 依賴 useReducedMotion()、
// <TransactionFormDialog> 依賴 useBreakpoint()，jsdom 預設沒有 matchMedia，需手動 stub。
function stubMatchMedia(reducedMotion = false): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: media.includes('prefers-reduced-motion') ? reducedMotion : false,
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

const useGetDashboardSummaryQuery = vi.fn()
vi.mock('@/lib/api/dashboardApi', () => ({
  useGetDashboardSummaryQuery: (args: unknown) => useGetDashboardSummaryQuery(args),
}))

const refetchNetWorth = vi.fn()
const useGetNetWorthQuery = vi.fn()
vi.mock('@/lib/api/assetsApi', () => ({
  useGetNetWorthQuery: () => useGetNetWorthQuery(),
}))

const useListAccountsQuery = vi.fn()
vi.mock('@/lib/api/accountsApi', () => ({
  useListAccountsQuery: () => useListAccountsQuery(),
}))

const useListTransactionsQuery = vi.fn()
const useListCategoryOptionsQuery = vi.fn()
const useListAccountOptionsQuery = vi.fn()
const createTransaction = vi.fn()
const useCreateTransactionMutation = vi.fn()
vi.mock('@/lib/api/transactionsApi', () => ({
  useListTransactionsQuery: (args: unknown) => useListTransactionsQuery(args),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
  useListAccountOptionsQuery: () => useListAccountOptionsQuery(),
  useCreateTransactionMutation: () => useCreateTransactionMutation(),
}))

const createRecurringRule = vi.fn()
const useCreateRecurringRuleMutation = vi.fn()
vi.mock('@/lib/api/recurringApi', () => ({
  useCreateRecurringRuleMutation: () => useCreateRecurringRuleMutation(),
}))

const SUMMARY: DashboardSummaryResponse = {
  period: 'month',
  date_from: '2026-09-01T00:00:00+08:00',
  date_to: '2026-09-30T23:59:59+08:00',
  income: '45000.00',
  expense: '28000.00',
  balance: '17000.00',
  budget_remaining: '3200.00',
}

const NET_WORTH = {
  total_assets: '150000.00',
  total_liabilities: '50000.00',
  net_worth: '100000.00',
}

const ACCOUNTS = {
  items: [
    { account_uid: 'a-cash', name: '現金', balance: '12000.00', currency: 'TWD', color: '#8B6ED6', icon: 'wallet' },
  ],
  total: 1,
}

const TRANSACTIONS = {
  items: [
    {
      transaction_uid: 't-1',
      account_uid: 'a-cash',
      category_uid: 'c-food',
      transaction_date: '2026-09-03T00:00:00+08:00',
      description: '午餐',
      amount: '120.00',
      transaction_type: 'expense' as const,
      payment_method: '現金',
      tags: [],
    },
  ],
  total: 1,
}

const CATEGORIES = [{ category_uid: 'c-food', name: '餐飲' }]

function mockSummary(overrides: Partial<DashboardSummaryResponse> = {}): void {
  useGetDashboardSummaryQuery.mockReturnValue({
    data: { ...SUMMARY, ...overrides },
    isLoading: false,
    error: undefined,
  })
}

describe('DashboardPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    push.mockClear()
    replace.mockClear()
    refetchNetWorth.mockClear()

    useGetMeQuery.mockReset().mockReturnValue({ isLoading: false, isError: false })
    useGetDashboardSummaryQuery.mockReset()
    mockSummary()
    useGetNetWorthQuery.mockReset().mockReturnValue({
      data: NET_WORTH,
      isLoading: false,
      error: undefined,
      refetch: refetchNetWorth,
    })
    useListAccountsQuery.mockReset().mockReturnValue({ data: ACCOUNTS, isLoading: false, error: undefined })
    useListTransactionsQuery.mockReset().mockReturnValue({ data: TRANSACTIONS })
    useListCategoryOptionsQuery.mockReset().mockReturnValue({ data: CATEGORIES })
    useListAccountOptionsQuery.mockReset().mockReturnValue({ data: ACCOUNTS.items })
    createTransaction.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(TRANSACTIONS.items[0]) })
    useCreateTransactionMutation.mockReset().mockReturnValue([createTransaction, { isLoading: false }])
    createRecurringRule.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) })
    useCreateRecurringRuleMutation.mockReset().mockReturnValue([createRecurringRule, { isLoading: false }])
  })

  it('預設以當月期間查詢彙總 API（→ A14 邊界轉換）', () => {
    render(<DashboardPage />)

    const expected = toPeriodRange(defaultPeriodSelection())
    expect(useGetDashboardSummaryQuery).toHaveBeenLastCalledWith({
      period: 'month',
      dateFrom: expected.dateFrom,
      dateTo: expected.dateTo,
    })
  })

  it('彙總載入中顯示載入提示，不顯示卡片數字', () => {
    useGetDashboardSummaryQuery.mockReturnValue({ data: undefined, isLoading: true, error: undefined })
    render(<DashboardPage />)

    expect(screen.getByText('載入中…')).toBeInTheDocument()
    expect(screen.queryByText('收入')).not.toBeInTheDocument()
  })

  it('渲染收入／支出／結餘／預算結餘四張卡片', () => {
    render(<DashboardPage />)

    expect(screen.getByText('收入')).toBeInTheDocument()
    expect(screen.getByText('NT$45,000')).toBeInTheDocument()
    expect(screen.getByText('支出')).toBeInTheDocument()
    expect(screen.getByText('NT$28,000')).toBeInTheDocument()
    expect(screen.getByText('結餘')).toBeInTheDocument()
    expect(screen.getByText('+NT$17,000')).toBeInTheDocument()
    expect(screen.getByText('預算結餘')).toBeInTheDocument()
    expect(screen.getByText('NT$3,200')).toBeInTheDocument()
  })

  it('卡片區桌機 grid-cols-4、行動端結餘跨欄置頂成 Hero（→ §9.2 RWD 對應）', () => {
    render(<DashboardPage />)

    const section = screen.getByLabelText('期間彙總')
    expect(section).toHaveClass('grid-cols-2')
    expect(section).toHaveClass('md:grid-cols-4')

    const heroTile = screen.getByText('+NT$17,000').closest('div')
    expect(heroTile).toHaveClass('order-first')
    expect(heroTile).toHaveClass('col-span-2')
    expect(heroTile).toHaveClass('md:col-span-1')
  })

  it('切換期間為「年」時以整年範圍重新查詢，且預算結餘卡顯示簡化狀態（→ A7）', () => {
    render(<DashboardPage />)

    mockSummary({ period: 'year', budget_remaining: null })
    fireEvent.change(screen.getByLabelText('期間'), { target: { value: 'year' } })

    const expected = toPeriodRange({ ...defaultPeriodSelection(), period: 'year' })
    expect(useGetDashboardSummaryQuery).toHaveBeenLastCalledWith({
      period: 'year',
      dateFrom: expected.dateFrom,
      dateTo: expected.dateTo,
    })
    expect(screen.getByText('預算僅支援月度檢視')).toBeInTheDocument()
    expect(screen.queryByText('NT$3,200')).not.toBeInTheDocument()
  })

  it('切換期間為「自訂範圍」時同樣顯示預算簡化狀態（→ A7）', () => {
    render(<DashboardPage />)

    mockSummary({ period: 'custom', budget_remaining: null })
    fireEvent.change(screen.getByLabelText('期間'), { target: { value: 'custom' } })

    expect(useGetDashboardSummaryQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ period: 'custom' }),
    )
    expect(screen.getByText('預算僅支援月度檢視')).toBeInTheDocument()
  })

  it('行動端 FAB 開啟新增交易表單（→ A12，非路由）', () => {
    render(<DashboardPage />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新增交易' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('新增交易')
  })

  it('桌機 Header 的「＋ 新增交易」按鈕同樣開啟表單', () => {
    render(<DashboardPage />)

    fireEvent.click(screen.getByRole('button', { name: '＋ 新增交易' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('報價服務回 424 時帳戶總覽卡顯示可重試提示', () => {
    useGetNetWorthQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { status: 424, data: { detail: '報價服務暫時無法使用，請稍後再試' } },
      refetch: refetchNetWorth,
    })
    render(<DashboardPage />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      '報價服務暫時無法使用，總資產 / 淨資產暫時無法計算，請稍後再試。',
    )
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(refetchNetWorth).toHaveBeenCalledTimes(1)
  })

  it('渲染帳戶總覽與最近交易摘要', () => {
    render(<DashboardPage />)

    expect(screen.getByText('帳戶總覽')).toBeInTheDocument()
    expect(screen.getByText('現金')).toBeInTheDocument()
    expect(screen.getByText('最近交易')).toBeInTheDocument()
    expect(screen.getByText('09/03 餐飲')).toBeInTheDocument()
    expect(screen.getByText('-NT$120')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看全部 →' })).toHaveAttribute('href', '/transactions')
  })

  it('prefers-reduced-motion 時圖表切換仍可用（動畫降級不停用功能，→ §6）', () => {
    stubMatchMedia(true)
    render(<DashboardPage />)

    expect(screen.getByRole('tablist', { name: '圖表類型' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '折線' }))
    expect(screen.getByRole('tab', { name: '折線' })).toHaveAttribute('aria-selected', 'true')
  })
})
