import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatTile, formatAmount } from './StatTile'

describe('formatAmount', () => {
  it('加上千分位與 NT$ 前綴，小數點捨去', () => {
    expect(formatAmount('45000.00')).toBe('NT$45,000')
  })

  it('signed 時正值加正號、負值一律顯示負號', () => {
    expect(formatAmount('17000.00', true)).toBe('+NT$17,000')
    expect(formatAmount('-17000.00', true)).toBe('-NT$17,000')
    expect(formatAmount('-120.00')).toBe('-NT$120')
  })

  it('無法解析的字串原樣輸出，不顯示 NaN', () => {
    expect(formatAmount('n/a')).toBe('n/a')
  })
})

describe('StatTile', () => {
  it('預設渲染標籤與格式化後金額', () => {
    render(<StatTile label="收入" value="45000.00" tone="income" />)

    expect(screen.getByText('收入')).toBeInTheDocument()
    expect(screen.getByText('NT$45,000')).toHaveClass('text-income-700')
  })

  it('tone=expense 用支出語意色', () => {
    render(<StatTile label="支出" value="28000.00" tone="expense" />)
    expect(screen.getByText('NT$28,000')).toHaveClass('text-expense-700')
  })

  it('hero 卡片字級拉大（行動端結餘 Hero，→ §2.5）', () => {
    render(<StatTile label="結餘" value="17000.00" signed hero />)

    const value = screen.getByText('+NT$17,000')
    expect(value).toHaveClass('text-3xl')
    expect(value).toHaveClass('md:text-4xl')
  })

  it('unavailable 時顯示灰階佔位與說明，不顯示估算數字（→ A7）', () => {
    render(<StatTile label="預算結餘" value="3200.00" tone="warning" unavailable hint="預算僅支援月度檢視" />)

    expect(screen.getByText('預算僅支援月度檢視')).toBeInTheDocument()
    expect(screen.queryByText('NT$3,200')).not.toBeInTheDocument()
    expect(screen.getByText('—')).toHaveClass('text-text-muted')
  })
})
