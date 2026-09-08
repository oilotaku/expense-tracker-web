import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionList } from './TransactionList'

// 同 TransactionFormDialog.test.tsx 既有慣例：msw 尚未涵蓋這種「mock RTK hook 回傳值」的
// page/component 層測試（真實 HTTP mock 走各自的 lib/api/<feature>Api.test.ts），直接 mock 兩個
// 唯讀 query。updateTransaction/deleteTransaction 這兩個 mutation 是本檔用
// `baseApi.injectEndpoints` 就地掛出的（→ TransactionList.tsx 頂部註解），故改 mock
// `@/lib/api/baseApi` 的 `enhanceEndpoints().injectEndpoints()` 呼叫鏈，讓它回傳可控的假 hook。
const useListTransactionsQuery = vi.fn()
const useListCategoryOptionsQuery = vi.fn()
const useListAccountOptionsQuery = vi.fn()

vi.mock('@/lib/api/transactionsApi', () => ({
  useListTransactionsQuery: (...args: unknown[]) => useListTransactionsQuery(...args),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
  useListAccountOptionsQuery: () => useListAccountOptionsQuery(),
}))

const updateTransaction = vi.fn()
const deleteTransaction = vi.fn()
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

const SAMPLE_TRANSACTION = {
  transaction_uid: 't1',
  account_uid: 'a1',
  category_uid: 'c1',
  transaction_date: '2026-08-25T09:30:00+08:00',
  description: '午餐',
  amount: '120.50',
  transaction_type: 'expense',
  payment_method: '現金',
  tags: [{ tag_uid: 'g1', name: '聚餐' }],
}

// 同 TransactionFormDialog.test.tsx：本頁 render 出的 <TransactionFormDialog> 需要 matchMedia
// （useBreakpoint / useReducedMotion），jsdom 預設沒有，手動 stub。桌機/行動兩種版面本身是
// CSS-only 切換（→ FE-063），測試環境不載入真實 Tailwind CSS，兩棵樹會同時出現在 DOM 裡，
// 故所有查詢一律用 `within(screen.getByRole('table'))` 或 `getAllByRole/getAllByText` 明確
// 消歧義，不能直接假設某段文字/角色只出現一次。
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

describe('TransactionList', () => {
  beforeEach(() => {
    stubMatchMedia(true)
    useListTransactionsQuery.mockReset().mockReturnValue({
      data: { items: [SAMPLE_TRANSACTION], total: 1 },
      isLoading: false,
      error: undefined,
    })
    useListCategoryOptionsQuery.mockReturnValue({ data: [{ category_uid: 'c1', name: '餐飲' }] })
    useListAccountOptionsQuery.mockReturnValue({
      data: [{ account_uid: 'a1', name: '現金', balance: '100.00', currency: 'TWD' }],
    })
    updateTransaction.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(SAMPLE_TRANSACTION) })
    deleteTransaction.mockReset().mockReturnValue({ unwrap: () => Promise.resolve(undefined) })
    useUpdateTransactionMutation.mockReturnValue([updateTransaction, { isLoading: false }])
    useDeleteTransactionMutation.mockReturnValue([deleteTransaction, { isLoading: false }])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('render 交易清單', () => {
    render(<TransactionList />)
    const table = within(screen.getByRole('table'))
    expect(table.getByText('午餐')).toBeInTheDocument()
    expect(table.getByText('餐飲')).toBeInTheDocument()
    expect(table.getByText('支出')).toBeInTheDocument()
  })

  it('載入中顯示載入文字，不顯示清單', () => {
    useListTransactionsQuery.mockReturnValue({ data: undefined, isLoading: true, error: undefined })
    render(<TransactionList />)
    expect(screen.getByText('載入中…')).toBeInTheDocument()
    expect(screen.queryByText('午餐')).not.toBeInTheDocument()
  })

  it('清單為空時顯示提示文字', () => {
    useListTransactionsQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: undefined,
    })
    render(<TransactionList />)
    expect(screen.getByText('沒有符合條件的交易')).toBeInTheDocument()
  })

  it('查詢錯誤時顯示錯誤訊息', () => {
    useListTransactionsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { status: 500, data: { detail: '伺服器錯誤' } },
    })
    render(<TransactionList />)
    expect(screen.getByRole('alert')).toHaveTextContent('伺服器錯誤')
  })

  it('篩選條件變更觸發重新查詢：期間/分類皆帶入新的 query 參數', () => {
    render(<TransactionList />)

    fireEvent.change(screen.getByLabelText('分類'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText('起始日期'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByLabelText('結束日期'), { target: { value: '2026-08-31' } })

    const lastArgs = useListTransactionsQuery.mock.calls.at(-1)?.[0]
    expect(lastArgs).toEqual({
      category_uid: 'c1',
      date_from: '2026-08-01T00:00:00+08:00',
      date_to: '2026-08-31T23:59:59+08:00',
      limit: 100,
    })
  })

  it('帳戶 / 類型篩選在前端過濾掉不符合的項目（後端查詢參數不支援這兩個欄位）', () => {
    useListTransactionsQuery.mockReturnValue({
      data: {
        items: [
          SAMPLE_TRANSACTION,
          { ...SAMPLE_TRANSACTION, transaction_uid: 't2', description: '薪水', transaction_type: 'income' },
        ],
        total: 2,
      },
      isLoading: false,
      error: undefined,
    })
    render(<TransactionList />)
    const table = within(screen.getByRole('table'))
    expect(table.getByText('午餐')).toBeInTheDocument()
    expect(table.getByText('薪水')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('類型'), { target: { value: 'income' } })

    expect(table.queryByText('午餐')).not.toBeInTheDocument()
    expect(table.getByText('薪水')).toBeInTheDocument()
  })

  it('點列開啟編輯表單並預帶既有值', () => {
    render(<TransactionList />)

    fireEvent.click(screen.getByRole('button', { name: '編輯' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(screen.getByText('編輯交易')).toBeInTheDocument()
    expect(dialog.getByLabelText('明細')).toHaveValue('午餐')
    expect(dialog.getByLabelText('帳戶')).toHaveValue('a1')
    expect(dialog.getByLabelText('分類')).toHaveValue('c1')
    expect(dialog.getByLabelText('金額')).toHaveValue('120.50')
  })

  it('編輯送出後呼叫 updateTransaction mutation', async () => {
    render(<TransactionList />)

    fireEvent.click(screen.getByRole('button', { name: '編輯' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('明細'), { target: { value: '晚餐' } })

    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: '儲存' }))
    })

    expect(updateTransaction).toHaveBeenCalledTimes(1)
    expect(updateTransaction.mock.calls[0]?.[0]).toMatchObject({
      transactionUid: 't1',
      description: '晚餐',
      account_uid: 'a1',
      category_uid: 'c1',
    })
  })

  it('刪除觸發 ConfirmDialog 且確認後呼叫刪除 API', async () => {
    render(<TransactionList />)

    fireEvent.click(screen.getAllByRole('button', { name: '刪除' })[0]!)
    expect(screen.getByText('刪除「午餐」？')).toBeInTheDocument()

    const dialog = within(screen.getByRole('dialog'))
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: '確認' }))
    })

    expect(deleteTransaction).toHaveBeenCalledWith('t1')
  })

  it('取消刪除確認不呼叫刪除 API', () => {
    render(<TransactionList />)

    fireEvent.click(screen.getAllByRole('button', { name: '刪除' })[0]!)
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: '取消' }))

    expect(deleteTransaction).not.toHaveBeenCalled()
  })
})
