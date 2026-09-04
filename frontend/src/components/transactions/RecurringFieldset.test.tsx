import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecurringFieldset, type RecurringFieldsetValue } from './RecurringFieldset'

const BASE_VALUE: RecurringFieldsetValue = {
  intervalUnit: 'month',
  intervalCount: 1,
  anchorDate: '2026-09-15',
}

describe('RecurringFieldset', () => {
  it('預設 render 顯示週/月/年三個單位選項，且目前單位為 aria-pressed', () => {
    render(<RecurringFieldset value={BASE_VALUE} onChange={() => {}} />)

    const weekButton = screen.getByRole('button', { name: '週' })
    const monthButton = screen.getByRole('button', { name: '月' })
    const yearButton = screen.getByRole('button', { name: '年' })

    expect(weekButton).toBeInTheDocument()
    expect(yearButton).toBeInTheDocument()
    expect(monthButton).toHaveAttribute('aria-pressed', 'true')
    expect(weekButton).toHaveAttribute('aria-pressed', 'false')
  })

  it('點擊「年」呼叫 onChange 並保留其餘欄位不變', () => {
    const onChange = vi.fn()
    render(<RecurringFieldset value={BASE_VALUE} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '年' }))

    expect(onChange).toHaveBeenCalledWith({
      intervalUnit: 'year',
      intervalCount: 1,
      anchorDate: '2026-09-15',
    })
  })

  it('間隔輸入框有原生 min=1 / max=99 邊界，且輸入變更會回報新值', () => {
    const onChange = vi.fn()
    render(<RecurringFieldset value={BASE_VALUE} onChange={onChange} />)

    const countInput = screen.getByLabelText('每幾個月執行一次（1–99）')
    expect(countInput).toHaveAttribute('min', '1')
    expect(countInput).toHaveAttribute('max', '99')

    fireEvent.change(countInput, { target: { value: '12' } })
    expect(onChange).toHaveBeenCalledWith({ ...BASE_VALUE, intervalCount: 12 })
  })

  it('interval_count 超出 1–99 範圍時，由呼叫端透過 errors prop 顯示錯誤並標記 aria-invalid', () => {
    render(
      <RecurringFieldset
        value={{ ...BASE_VALUE, intervalCount: 150 }}
        onChange={() => {}}
        errors={{ intervalCount: '間隔需為 1–99' }}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('間隔需為 1–99')
    // errors prop 會讓錯誤文字一併併入 <label> 的可及名稱（同一個 <label> 內），故這裡改用
    // 部分符合的 regex，避免與上面剛加入的錯誤文字組合後不再完全相等。
    expect(screen.getByLabelText(/每幾個月執行一次（1–99）/)).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('disabled 時所有互動元件皆停用', () => {
    render(<RecurringFieldset value={BASE_VALUE} onChange={() => {}} disabled />)

    expect(screen.getByRole('button', { name: '週' })).toBeDisabled()
    expect(screen.getByLabelText('每幾個月執行一次（1–99）')).toBeDisabled()
    expect(screen.getByLabelText('起算日')).toBeDisabled()
  })
})
