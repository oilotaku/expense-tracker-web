import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useChartPreference } from './useChartPreference'

const STORAGE_KEY = 'chart-type-preference'

describe('useChartPreference', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('localStorage 無值時預設為 pie（→ A11 預設圓餅圖）', () => {
    const { result } = renderHook(() => useChartPreference())
    expect(result.current.chartType).toBe('pie')
  })

  it('localStorage 已有合法值（bar）時讀回', () => {
    window.localStorage.setItem(STORAGE_KEY, 'bar')
    const { result } = renderHook(() => useChartPreference())
    expect(result.current.chartType).toBe('bar')
  })

  it('localStorage 已有合法值（line）時讀回', () => {
    window.localStorage.setItem(STORAGE_KEY, 'line')
    const { result } = renderHook(() => useChartPreference())
    expect(result.current.chartType).toBe('line')
  })

  it('localStorage 值不合法時解析降級為 pie', () => {
    window.localStorage.setItem(STORAGE_KEY, 'donut')
    const { result } = renderHook(() => useChartPreference())
    expect(result.current.chartType).toBe('pie')
  })

  it('setChartType("bar") 寫入 localStorage 並更新 chartType', () => {
    const { result } = renderHook(() => useChartPreference())
    act(() => {
      result.current.setChartType('bar')
    })
    expect(result.current.chartType).toBe('bar')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('bar')
  })

  it('寫入後重新掛載（模擬下次載入）讀回同一個值', () => {
    const { result, unmount } = renderHook(() => useChartPreference())
    act(() => {
      result.current.setChartType('line')
    })
    unmount()

    const { result: nextResult } = renderHook(() => useChartPreference())
    expect(nextResult.current.chartType).toBe('line')
  })
})
