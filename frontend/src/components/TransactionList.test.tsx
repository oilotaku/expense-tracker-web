import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionList } from './TransactionList'

// 同 TransactionForm.test.tsx：msw 尚未成為 devDependency，直接 mock RTK Query hook。
const useListTransactionsQuery = vi.fn()
const useListCategoryOptionsQuery = vi.fn()

vi.mock('@/lib/api/transactionsApi', () => ({
  useListTransactionsQuery: (...args: unknown[]) => useListTransactionsQuery(...args),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
}))

describe('TransactionList', () => {
  beforeEach(() => {
    useListTransactionsQuery.mockReset().mockReturnValue({
      data: {
        items: [
          {
            transaction_uid: 't1',
            account_uid: 'a1',
            category_uid: 'c1',
            transaction_date: '2026-08-25T09:30:00+08:00',
            description: '午餐',
            amount: '120.50',
            transaction_type: 'expense',
            payment_method: '現金',
            tags: [{ tag_uid: 'g1', name: '聚餐' }],
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: undefined,
    })
    useListCategoryOptionsQuery.mockReturnValue({
      data: [{ category_uid: 'c1', name: '餐飲' }],
    })
  })

  it('render 交易清單', () => {
    render(<TransactionList />)
    expect(screen.getByText('午餐')).toBeInTheDocument()
    expect(screen.getByText('聚餐')).toBeInTheDocument()
    expect(screen.getByText('支出')).toBeInTheDocument()
  })

  it('載入中顯示載入文字，不顯示表格', () => {
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

  it('切換日期 / 分類篩選會用新的 filter 呼叫 query', () => {
    render(<TransactionList />)

    fireEvent.change(screen.getByLabelText('分類'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText('起始日期'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByLabelText('結束日期'), { target: { value: '2026-08-31' } })

    const lastArgs = useListTransactionsQuery.mock.calls.at(-1)?.[0]
    expect(lastArgs).toEqual({
      category_uid: 'c1',
      date_from: '2026-08-01T00:00:00+08:00',
      date_to: '2026-08-31T23:59:59+08:00',
    })
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
})
