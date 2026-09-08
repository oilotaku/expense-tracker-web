import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TransactionsPage from './page'

// 同 accounts/page.test.tsx：page 層測試直接 mock RTK Query hook 的回傳值來驗證組裝邏輯
// （真實 HTTP mock 走各自的 lib/api/<feature>Api.test.ts）；AppShell 內的 Sidebar/BottomNav
// 需要 next/navigation（→ AppShell.test.tsx 同一 mock）。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/transactions',
}))

const useGetMeQuery = vi.fn()
vi.mock('@/lib/api/authApi', () => ({
  useGetMeQuery: () => useGetMeQuery(),
}))

const createTransaction = vi.fn()
const useCreateTransactionMutation = vi.fn()
const useListAccountOptionsQuery = vi.fn()
const useListCategoryOptionsQuery = vi.fn()
const useListTransactionsQuery = vi.fn()
vi.mock('@/lib/api/transactionsApi', () => ({
  useCreateTransactionMutation: () => useCreateTransactionMutation(),
  useListAccountOptionsQuery: () => useListAccountOptionsQuery(),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
  useListTransactionsQuery: (...args: unknown[]) => useListTransactionsQuery(...args),
}))

const createRecurringRule = vi.fn()
const useCreateRecurringRuleMutation = vi.fn()
vi.mock('@/lib/api/recurringApi', () => ({
  useCreateRecurringRuleMutation: () => useCreateRecurringRuleMutation(),
}))

// TransactionList.tsx 用 baseApi.injectEndpoints 就地掛出 update/delete mutation
// （→ TransactionList.tsx 頂部註解 / TransactionList.test.tsx 同一 mock 手法）。
const useUpdateTransactionMutation = vi.fn()
const useDeleteTransactionMutation = vi.fn()
vi.mock('@/lib/api/baseApi', () => ({
  baseApi: {
    enhanceEndpoints: () => ({
      injectEndpoints: () => ({
        useUpdateTransactionMutation: () => useUpdateTransactionMutation(),
        useDeleteTransactionMutation: () => useDeleteTransactionMutation(),
      }),
    }),
  },
}))

function stubMatchMedia(isDesktop: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((media: string) => ({
      matches: media.includes('768px') ? isDesktop : false,
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  )
}

async function typeAmount(digits: string): Promise<void> {
  for (const digit of digits) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: `數字 ${digit}` }))
    })
  }
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    stubMatchMedia(true)
    useGetMeQuery.mockReturnValue({ isLoading: false, isError: false })
    useListAccountOptionsQuery.mockReturnValue({
      data: [{ account_uid: 'a1', name: '現金', balance: '100.00', currency: 'TWD' }],
    })
    useListCategoryOptionsQuery.mockReturnValue({
      data: [
        { category_uid: 'c1', name: '餐飲' },
        { category_uid: 'c-other', name: '其他' },
      ],
    })
    useListTransactionsQuery.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false, error: undefined })

    createTransaction.mockReset().mockReturnValue({ unwrap: () => Promise.resolve({ transaction_uid: 't1' }) })
    useCreateTransactionMutation.mockReturnValue([createTransaction, { isLoading: false }])
    createRecurringRule
      .mockReset()
      .mockReturnValue({ unwrap: () => Promise.resolve({ recurring_rule_uid: 'r1' }) })
    useCreateRecurringRuleMutation.mockReturnValue([createRecurringRule, { isLoading: false }])
    useUpdateTransactionMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    useDeleteTransactionMutation.mockReturnValue([vi.fn(), { isLoading: false }])

    try {
      window.localStorage.clear()
    } catch {
      // jsdom 環境下 localStorage 一般可用，clear 失敗不影響測試本身
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('未登入時導向 /login，不 render 頁面內容', () => {
    useGetMeQuery.mockReturnValue({ isLoading: false, isError: true })
    render(<TransactionsPage />)
    expect(screen.queryByText('交易')).not.toBeInTheDocument()
  })

  it('登入後 render AppShell 導覽與交易清單頁面標題', () => {
    render(<TransactionsPage />)
    expect(screen.getByRole('heading', { name: '交易', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '主導覽' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '行動導覽' })).toBeInTheDocument()
  })

  it('點桌機「＋ 新增交易」按鈕開啟新增表單', () => {
    render(<TransactionsPage />)
    fireEvent.click(screen.getByRole('button', { name: '＋ 新增交易' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText('新增交易')).toBeInTheDocument()
  })

  it('點 FAB「新增交易」開啟新增表單，非固定收支送出時呼叫 createTransaction', async () => {
    render(<TransactionsPage />)
    fireEvent.click(screen.getByRole('button', { name: '新增交易' }))

    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('radio', { name: '支出' }))
    await typeAmount('200')

    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: '儲存' }))
    })

    expect(createTransaction).toHaveBeenCalledTimes(1)
    expect(createRecurringRule).not.toHaveBeenCalled()
    expect(createTransaction.mock.calls[0]?.[0]).toMatchObject({
      transaction_type: 'expense',
      amount: '200',
      account_uid: 'a1',
    })
  })

  it('勾選「固定收支」送出時改呼叫 createRecurringRule，不呼叫 createTransaction', async () => {
    render(<TransactionsPage />)
    fireEvent.click(screen.getByRole('button', { name: '新增交易' }))

    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('radio', { name: '支出' }))
    await typeAmount('300')
    fireEvent.click(dialog.getByLabelText('固定收支'))

    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: '儲存' }))
    })

    expect(createRecurringRule).toHaveBeenCalledTimes(1)
    expect(createTransaction).not.toHaveBeenCalled()
    expect(createRecurringRule.mock.calls[0]?.[0]).toMatchObject({
      transaction_type: 'expense',
      amount: '300',
      account_uid: 'a1',
      interval_unit: 'month',
      interval_count: 1,
    })
  })
})
