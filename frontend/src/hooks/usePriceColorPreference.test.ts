import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePriceColorPreference } from './usePriceColorPreference'

const STORAGE_KEY = 'price-color-scheme-preference'

describe('usePriceColorPreference', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('localStorage 無值時預設為 red-up（台股慣例漲紅跌綠）', () => {
    const { result } = renderHook(() => usePriceColorPreference())
    expect(result.current.scheme).toBe('red-up')
  })

  it('localStorage 已有合法值（green-up）時讀回', () => {
    window.localStorage.setItem(STORAGE_KEY, 'green-up')
    const { result } = renderHook(() => usePriceColorPreference())
    expect(result.current.scheme).toBe('green-up')
  })

  it('localStorage 值不合法時解析降級為 red-up', () => {
    window.localStorage.setItem(STORAGE_KEY, 'rainbow')
    const { result } = renderHook(() => usePriceColorPreference())
    expect(result.current.scheme).toBe('red-up')
  })

  it('setScheme("green-up") 寫入 localStorage 並更新 scheme', () => {
    const { result } = renderHook(() => usePriceColorPreference())
    act(() => {
      result.current.setScheme('green-up')
    })
    expect(result.current.scheme).toBe('green-up')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('green-up')
  })

  it('寫入後重新掛載讀回同一個值', () => {
    const { result, unmount } = renderHook(() => usePriceColorPreference())
    act(() => {
      result.current.setScheme('green-up')
    })
    unmount()

    const { result: nextResult } = renderHook(() => usePriceColorPreference())
    expect(nextResult.current.scheme).toBe('green-up')
  })

  it('red-up：漲用 expense-600（紅）、跌用 income-600（綠）', () => {
    const { result } = renderHook(() => usePriceColorPreference())
    expect(result.current.colorForGain(true)).toBe('text-expense-600')
    expect(result.current.colorForGain(false)).toBe('text-income-600')
  })

  it('green-up：漲用 income-600（綠）、跌用 expense-600（紅）', () => {
    window.localStorage.setItem(STORAGE_KEY, 'green-up')
    const { result } = renderHook(() => usePriceColorPreference())
    expect(result.current.colorForGain(true)).toBe('text-income-600')
    expect(result.current.colorForGain(false)).toBe('text-expense-600')
  })
})
