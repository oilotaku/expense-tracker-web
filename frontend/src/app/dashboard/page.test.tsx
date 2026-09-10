import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage, { toTrendPoints } from './page'
import { defaultPeriodSelection, toPeriodRange } from '@/components/dashboard/PeriodSelector'
import type { DashboardSummaryResponse } from '@/lib/api/dashboardApi'

// 同 accounts/page.test.tsx / settings/page.test.tsx：page 層測試直接 mock RTK Query hook 的回傳
// 值來驗證頁面組裝邏輯（真實 HTTP mock 走各自 lib/api/*.test.ts，→ FE-012）。
const push = vi.fn()
const replace = vi.fn()
let searchParams = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/dashboard',
  useSearchParams: () => searchParams,
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
const useGetExchangeRatesQuery = vi.fn()
vi.mock('@/lib/api/dashboardApi', () => ({
  useGetDashboardSummaryQuery: (args: unknown) => useGetDashboardSummaryQuery(args),
  useGetExchangeRatesQuery: () => useGetExchangeRatesQuery(),
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
const createTransfer = vi.fn()
const useCreateTransferMutation = vi.fn()
vi.mock('@/lib/api/transactionsApi', () => ({
  useListTransactionsQuery: (args: unknown) => useListTransactionsQuery(args),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
  useListAccountOptionsQuery: () => useListAccountOptionsQuery(),
  useCreateTransactionMutation: () => useCreateTransactionMutation(),
  useCreateTransferMutation: () => useCreateTransferMutation(),
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
  assets: [],
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
    searchParams = new URLSearchParams()
    window.localStorage.clear()

    useGetMeQuery.mockReset().mockReturnValue({
      data: { user_uid: 'u1', email: 'a@b.com', has_pin: false },
      isLoading: false,
      isError: false,
    })
    useGetDashboardSummaryQuery.mockReset()
    mockSummary()
    useGetExchangeRatesQuery.mockReset().mockReturnValue({
      data: { rates: { TWD: '1', USD: '31.5' } },
      isLoading: false,
      error: undefined,
    })
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
    createTransfer.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({}) })
    useCreateTransferMutation.mockReset().mockReturnValue([createTransfer, { isLoading: false }])
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
    expect(screen.getByText('-120 TWD')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看全部 →' })).toHaveAttribute('href', '/transactions')
  })

  describe('PIN 快速登入提醒', () => {
    const REMINDER_TITLE = '要設定 PIN 快速登入嗎？'
    const REMINDER_STORAGE_KEY = 'pin-reminder-shown:u1'

    it('註冊後首次登入（?justRegistered=1）顯示提醒、記下旗標並清掉 query param', () => {
      searchParams = new URLSearchParams('justRegistered=1')
      render(<DashboardPage />)

      expect(screen.getByText(REMINDER_TITLE)).toBeInTheDocument()
      // 顯示的當下就記錄，使用者直接離開也不會再跳
      expect(window.localStorage.getItem(REMINDER_STORAGE_KEY)).toBe('shown')
      expect(replace).toHaveBeenCalledWith('/dashboard')
    })

    it('沒有 justRegistered 時不顯示提醒（不騷擾刻意不設 PIN 的既有使用者）', () => {
      render(<DashboardPage />)

      expect(screen.queryByText(REMINDER_TITLE)).not.toBeInTheDocument()
      expect(window.localStorage.getItem(REMINDER_STORAGE_KEY)).toBeNull()
    })

    it('同一裝置已提醒過就不再顯示，即使又帶 justRegistered', () => {
      window.localStorage.setItem(REMINDER_STORAGE_KEY, 'shown')
      searchParams = new URLSearchParams('justRegistered=1')
      render(<DashboardPage />)

      expect(screen.queryByText(REMINDER_TITLE)).not.toBeInTheDocument()
    })

    it('「立即設定」導向設定頁（§9.7 既有 PIN 設定流程）', () => {
      searchParams = new URLSearchParams('justRegistered=1')
      render(<DashboardPage />)

      fireEvent.click(screen.getByRole('button', { name: '立即設定' }))

      expect(push).toHaveBeenCalledWith('/settings')
    })

    it('「稍後再說」不導頁，且重新進入頁面也不再出現', () => {
      searchParams = new URLSearchParams('justRegistered=1')
      const { unmount } = render(<DashboardPage />)

      fireEvent.click(screen.getByRole('button', { name: '稍後再說' }))
      expect(push).not.toHaveBeenCalled()

      unmount()
      render(<DashboardPage />)
      expect(screen.queryByText(REMINDER_TITLE)).not.toBeInTheDocument()
    })
  })

  it('prefers-reduced-motion 時圖表切換仍可用（動畫降級不停用功能，→ §6）', () => {
    stubMatchMedia(true)
    render(<DashboardPage />)

    expect(screen.getByRole('tablist', { name: '圖表類型' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '折線' }))
    expect(screen.getByRole('tab', { name: '折線' })).toHaveAttribute('aria-selected', 'true')
  })

  it('分類圖表跨幣別交易換算成 TWD 後再加總，不直接把不同幣別的原始金額相加（外幣帳戶功能）', () => {
    useListAccountsQuery.mockReturnValue({
      data: {
        items: [
          ...ACCOUNTS.items,
          {
            account_uid: 'a-usd',
            name: '美金帳戶',
            balance: '500.00',
            currency: 'USD',
            color: '#E8834B',
            icon: 'savings',
          },
        ],
        total: 2,
      },
      isLoading: false,
      error: undefined,
    })
    useListTransactionsQuery.mockReturnValue({
      data: {
        items: [
          ...TRANSACTIONS.items,
          {
            transaction_uid: 't-2',
            account_uid: 'a-usd',
            category_uid: 'c-food',
            transaction_date: '2026-09-04T00:00:00+08:00',
            description: '海外餐廳',
            amount: '10.00',
            transaction_type: 'expense' as const,
            payment_method: '信用卡',
            tags: [],
          },
        ],
        total: 2,
      },
    })

    render(<DashboardPage />)

    // 120 TWD + 10 USD × 31.5 = 435；若誤把不同幣別原始金額直接相加會變成 130（bug 級結果）
    expect(screen.getByText('NT$435')).toBeInTheDocument()
    expect(screen.queryByText('NT$130')).not.toBeInTheDocument()
  })
})

describe('toTrendPoints', () => {
  const RATES = { TWD: '1', USD: '31.5' }

  it('轉帳列不計入收支趨勢（兩邊帳戶互相抵銷，不是真正的收入或支出）', () => {
    const points = toTrendPoints(
      [
        {
          transaction_uid: 't-transfer-out',
          account_uid: 'a-cash',
          category_uid: null,
          transaction_date: '2026-09-03T00:00:00+08:00',
          description: '轉帳',
          amount: '500.00',
          transaction_type: 'transfer',
          payment_method: '轉帳',
          tags: [],
          transfer_group_uid: 'g-1',
          transfer_direction: 'out',
          transfer_counterpart_account_uid: 'a-bank',
        },
        {
          transaction_uid: 't-income',
          account_uid: 'a-cash',
          category_uid: 'c-salary',
          transaction_date: '2026-09-03T00:00:00+08:00',
          description: '薪資',
          amount: '1000.00',
          transaction_type: 'income',
          payment_method: '轉帳',
          tags: [],
          transfer_group_uid: null,
          transfer_direction: null,
          transfer_counterpart_account_uid: null,
        },
      ],
      new Map([['a-cash', 'TWD']]),
      RATES,
    )

    expect(points).toEqual([{ date: '2026-09-03', income: 1000, expense: 0 }])
  })

  it('外幣帳戶交易依匯率換算成 TWD 後才加總進趨勢資料', () => {
    const points = toTrendPoints(
      [
        {
          transaction_uid: 't-expense-usd',
          account_uid: 'a-usd',
          category_uid: 'c-food',
          transaction_date: '2026-09-03T00:00:00+08:00',
          description: '海外餐廳',
          amount: '10.00',
          transaction_type: 'expense',
          payment_method: '信用卡',
          tags: [],
          transfer_group_uid: null,
          transfer_direction: null,
          transfer_counterpart_account_uid: null,
        },
      ],
      new Map([['a-usd', 'USD']]),
      RATES,
    )

    // 10 USD × 31.5 = 315
    expect(points).toEqual([{ date: '2026-09-03', income: 0, expense: 315 }])
  })
})
