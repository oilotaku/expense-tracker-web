import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionFormDialog } from './TransactionFormDialog'

// 同 TransactionForm.test.tsx 既有慣例：mock RTK Query hook 的回傳值來驗證表單邏輯。本元件
// 刻意不呼叫任何 mutation（→ 元件內註解），故這裡只需 mock 兩個唯讀 query。
const useListAccountOptionsQuery = vi.fn()
const useListCategoryOptionsQuery = vi.fn()

vi.mock('@/lib/api/transactionsApi', () => ({
  useListAccountOptionsQuery: () => useListAccountOptionsQuery(),
  useListCategoryOptionsQuery: () => useListCategoryOptionsQuery(),
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

describe('TransactionFormDialog', () => {
  beforeEach(() => {
    stubMatchMedia(true)
    useListAccountOptionsQuery.mockReturnValue({
      data: [{ account_uid: 'a1', name: '現金', balance: '100.00', currency: 'TWD' }],
    })
    useListCategoryOptionsQuery.mockReturnValue({
      data: [
        { category_uid: 'c1', name: '餐飲' },
        { category_uid: 'c-other', name: '其他' },
      ],
    })
    try {
      window.localStorage.clear()
    } catch {
      // jsdom 環境下 localStorage 一般可用，clear 失敗不影響測試本身
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('三必填欄位驗證：收支類型未選、金額為空時擋下送出並顯示錯誤', async () => {
    const onSubmit = vi.fn()
    render(<TransactionFormDialog open onOpenChange={() => {}} onSubmit={onSubmit} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    })

    expect(screen.getByText('請選擇收支類型')).toBeInTheDocument()
    expect(screen.getByText('請輸入金額')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('留白分類/明細/支付方式送出時，分類補「其他」、明細與支付方式為空字串', async () => {
    const onSubmit = vi.fn()
    render(<TransactionFormDialog open onOpenChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('radio', { name: '支出' }))
    await typeAmount('120')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      transaction_type: 'expense',
      amount: '120',
      category_uid: 'c-other',
      description: '',
      account_uid: 'a1',
      payment_method: '',
      recurring: null,
    })
    expect(payload.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/)
  })

  it('金額 > 0 驗證：輸入 0 時擋下送出', async () => {
    const onSubmit = vi.fn()
    render(<TransactionFormDialog open onOpenChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('radio', { name: '收入' }))
    await typeAmount('0')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    })

    expect(screen.getByText('金額需大於 0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // 外幣帳戶功能：轉出/轉入帳戶幣別不同時顯示提示文字，不擋送出（實際換算由後端算，
  // → backend/app/api/v1/transactions.py _convert_amount）。
  it('轉帳模式下，轉出/轉入帳戶幣別不同時顯示換算提示；改回同幣別時提示消失', async () => {
    useListAccountOptionsQuery.mockReturnValue({
      data: [
        { account_uid: 'a1', name: '現金', balance: '100.00', currency: 'TWD' },
        { account_uid: 'a2', name: '美金帳戶', balance: '50.00', currency: 'USD' },
        { account_uid: 'a3', name: '銀行', balance: '200.00', currency: 'TWD' },
      ],
    })
    render(<TransactionFormDialog open onOpenChange={() => {}} onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole('radio', { name: '轉帳' }))
    fireEvent.change(screen.getByLabelText('轉出帳戶'), { target: { value: 'a1' } })
    fireEvent.change(screen.getByLabelText('轉入帳戶'), { target: { value: 'a2' } })

    expect(screen.getByText('TWD → USD：將以即時匯率換算成 USD')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('轉入帳戶'), { target: { value: 'a3' } })

    expect(screen.queryByText(/將以即時匯率換算成/)).not.toBeInTheDocument()
  })

  it('RecurringFieldset 週/月/年三種單位可選，勾選固定收支後送出對應 recurring 設定', async () => {
    const onSubmit = vi.fn()
    render(<TransactionFormDialog open onOpenChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('radio', { name: '支出' }))
    await typeAmount('50')
    fireEvent.click(screen.getByLabelText('固定收支'))
    fireEvent.click(screen.getByRole('button', { name: '週' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]?.[0]
    expect(payload.recurring).toMatchObject({ interval_unit: 'week', interval_count: 1 })
  })

  it('interval_count 超出 1–99 範圍時前端擋下不送出', async () => {
    const onSubmit = vi.fn()
    render(<TransactionFormDialog open onOpenChange={() => {}} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('radio', { name: '支出' }))
    await typeAmount('50')
    fireEvent.click(screen.getByLabelText('固定收支'))
    fireEvent.change(screen.getByLabelText('每幾個月執行一次（1–99）'), {
      target: { value: '150' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '儲存' }))
    })

    expect(screen.getByText('間隔需為 1–99')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('編輯模式（mode="edit"）預帶既有值', () => {
    render(
      <TransactionFormDialog
        open
        onOpenChange={() => {}}
        mode="edit"
        initialValues={{
          transaction_type: 'income',
          transaction_date: '2026-09-04T14:00:00+08:00',
          amount: '3000',
          category_uid: 'c1',
          description: '獎金',
          account_uid: 'a1',
          payment_method: '銀行轉帳',
          recurring: { interval_unit: 'year', interval_count: 2, anchor_date: '2026-01-01' },
        }}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('radio', { name: '收入' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('日期')).toHaveValue('2026-09-04')
    expect(screen.getByDisplayValue('3000')).toBeInTheDocument()
    expect(screen.getByLabelText('明細')).toHaveValue('獎金')
    expect(screen.getByLabelText('固定收支')).toBeChecked()
    expect(screen.getByRole('button', { name: '年' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('起算日')).toHaveValue('2026-01-01')
  })
})
