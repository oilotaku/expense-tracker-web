import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  PeriodSelector,
  defaultPeriodSelection,
  toPeriodRange,
  type PeriodSelection,
} from './PeriodSelector'

const MONTH_SELECTION: PeriodSelection = {
  period: 'month',
  month: '2026-09',
  year: '2026',
  customFrom: '2026-09-01',
  customTo: '2026-09-07',
}

describe('toPeriodRange', () => {
  it('月：起訖為該月第一天 00:00:00 到最後一天 23:59:59（API_TZ offset，→ A14）', () => {
    expect(toPeriodRange(MONTH_SELECTION)).toEqual({
      dateFrom: '2026-09-01T00:00:00+08:00',
      dateTo: '2026-09-30T23:59:59+08:00',
    })
  })

  it('月：2 月天數依年份計算（非閏年 28 天、閏年 29 天）', () => {
    expect(toPeriodRange({ ...MONTH_SELECTION, month: '2026-02' }).dateTo).toBe('2026-02-28T23:59:59+08:00')
    expect(toPeriodRange({ ...MONTH_SELECTION, month: '2028-02' }).dateTo).toBe('2028-02-29T23:59:59+08:00')
  })

  it('年：整年範圍', () => {
    expect(toPeriodRange({ ...MONTH_SELECTION, period: 'year' })).toEqual({
      dateFrom: '2026-01-01T00:00:00+08:00',
      dateTo: '2026-12-31T23:59:59+08:00',
    })
  })

  it('自訂範圍：直接使用使用者選的起訖日', () => {
    expect(
      toPeriodRange({ ...MONTH_SELECTION, period: 'custom', customFrom: '2026-03-05', customTo: '2026-04-10' }),
    ).toEqual({
      dateFrom: '2026-03-05T00:00:00+08:00',
      dateTo: '2026-04-10T23:59:59+08:00',
    })
  })
})

describe('defaultPeriodSelection', () => {
  it('預設為月期間，月份格式為 YYYY-MM', () => {
    const selection = defaultPeriodSelection()
    expect(selection.period).toBe('month')
    expect(selection.month).toMatch(/^\d{4}-\d{2}$/)
    expect(selection.month.startsWith(selection.year)).toBe(true)
  })
})

describe('PeriodSelector', () => {
  it('月期間顯示月份輸入，切換期間會回報新的選擇', () => {
    const onChange = vi.fn()
    render(<PeriodSelector value={MONTH_SELECTION} onChange={onChange} />)

    expect(screen.getByLabelText('月份')).toHaveValue('2026-09')

    fireEvent.change(screen.getByLabelText('期間'), { target: { value: 'year' } })
    expect(onChange).toHaveBeenCalledWith({ ...MONTH_SELECTION, period: 'year' })
  })

  it('改月份會回報新的月份', () => {
    const onChange = vi.fn()
    render(<PeriodSelector value={MONTH_SELECTION} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('月份'), { target: { value: '2026-08' } })
    expect(onChange).toHaveBeenCalledWith({ ...MONTH_SELECTION, month: '2026-08' })
  })

  it('年期間顯示年份輸入，不顯示月份輸入', () => {
    const onChange = vi.fn()
    render(<PeriodSelector value={{ ...MONTH_SELECTION, period: 'year' }} onChange={onChange} />)

    expect(screen.queryByLabelText('月份')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('年份'), { target: { value: '2025' } })
    expect(onChange).toHaveBeenCalledWith({ ...MONTH_SELECTION, period: 'year', year: '2025' })
  })

  it('自訂範圍顯示起訖日期兩個輸入', () => {
    const onChange = vi.fn()
    render(<PeriodSelector value={{ ...MONTH_SELECTION, period: 'custom' }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('起始日期'), { target: { value: '2026-03-05' } })
    expect(onChange).toHaveBeenCalledWith({ ...MONTH_SELECTION, period: 'custom', customFrom: '2026-03-05' })

    fireEvent.change(screen.getByLabelText('結束日期'), { target: { value: '2026-04-10' } })
    expect(onChange).toHaveBeenCalledWith({ ...MONTH_SELECTION, period: 'custom', customTo: '2026-04-10' })
  })
})
