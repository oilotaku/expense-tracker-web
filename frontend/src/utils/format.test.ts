import { describe, expect, it } from 'vitest'
import { formatAmount, transactionAmountSign } from './format'

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

describe('transactionAmountSign', () => {
  it('收入 +、支出 -、轉帳不加號（收支不只靠顏色區分，fixed.md §27）', () => {
    expect(transactionAmountSign('income')).toBe('+')
    expect(transactionAmountSign('expense')).toBe('-')
    expect(transactionAmountSign('transfer')).toBe('')
  })
})
