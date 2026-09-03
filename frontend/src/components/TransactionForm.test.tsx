import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionForm } from './TransactionForm'

// msw 尚未成為 devDependency（package.json 未列，只在 allowScripts 預先核可，見 authApi.ts /
// AuthGuard.test.tsx 頂部同一備註），故直接 mock RTK Query hook 的回傳值來驗證表單送出邏輯，
// 而非起假 HTTP server。
const createTransaction = vi.fn()
const useCreateTransactionMutation = vi.fn()
const useListAccountOptionsQuery = vi.fn()
const useListCategoryOptionsQuery = vi.fn()

vi.mock('@/lib/api/transactionsApi', () => ({
  useCreateTransactionMutation: () => useCreateTransactionMutation(),
  useListAccountOptionsQuery: () => useListAccountOptionsQuery(),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
}))

describe('TransactionForm', () => {
  beforeEach(() => {
    createTransaction.mockReset().mockReturnValue({
      unwrap: () => Promise.resolve({ transaction_uid: 't1' }),
    })
    useCreateTransactionMutation.mockReturnValue([
      createTransaction,
      { isLoading: false, error: undefined },
    ])
    useListAccountOptionsQuery.mockReturnValue({
      data: [{ account_uid: 'a1', name: '現金', balance: '100.00', currency: 'TWD' }],
    })
    useListCategoryOptionsQuery.mockReturnValue({
      data: [{ category_uid: 'c1', name: '餐飲' }],
    })
  })

  it('送出表單觸發 createTransaction mutation，標籤以逗號拆分並去除空白/重複', async () => {
    render(<TransactionForm />)

    fireEvent.change(screen.getByLabelText('分類'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText('帳戶'), { target: { value: 'a1' } })
    fireEvent.change(screen.getByLabelText('說明'), { target: { value: '午餐' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '120.5' } })
    fireEvent.change(screen.getByLabelText('支付方式'), { target: { value: '現金' } })
    fireEvent.change(screen.getByLabelText('標籤（以逗號分隔，可留空）'), {
      target: { value: ' 午餐, 聚餐 ,午餐 ' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新增交易' }))
    })

    expect(createTransaction).toHaveBeenCalledTimes(1)
    const payload = createTransaction.mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      account_uid: 'a1',
      category_uid: 'c1',
      description: '午餐',
      amount: '120.5',
      transaction_type: 'expense',
      payment_method: '現金',
      tags: ['午餐', '聚餐'],
    })
    expect(payload.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+08:00$/)
  })

  it('mutation 回錯誤時顯示錯誤訊息', () => {
    useCreateTransactionMutation.mockReturnValue([
      createTransaction,
      { isLoading: false, error: { status: 400, data: { detail: '帳戶不存在' } } },
    ])
    render(<TransactionForm />)
    expect(screen.getByRole('alert')).toHaveTextContent('帳戶不存在')
  })

  it('下拉選單顯示帳戶與分類選項', () => {
    render(<TransactionForm />)
    expect(screen.getByRole('option', { name: '現金' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '餐飲' })).toBeInTheDocument()
  })
})
