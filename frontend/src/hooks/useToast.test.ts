import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetToastStoreForTests, useToast } from './useToast'

describe('useToast', () => {
  beforeEach(() => {
    __resetToastStoreForTests()
  })

  afterEach(() => {
    __resetToastStoreForTests()
    vi.useRealTimers()
  })

  it('初始狀態沒有任何 toast', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toasts).toHaveLength(0)
  })

  it('success 推送一筆 toast 並帶正確 variant', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.success('已儲存')
    })
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0]).toMatchObject({ message: '已儲存', variant: 'success' })
  })

  it('error / info 各自推送對應 variant', () => {
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.error('發生錯誤')
      result.current.info('提示訊息')
    })
    expect(result.current.toasts).toHaveLength(2)
    expect(result.current.toasts[0]?.variant).toBe('error')
    expect(result.current.toasts[1]?.variant).toBe('info')
  })

  it('dismiss(id) 移除指定 toast', () => {
    const { result } = renderHook(() => useToast())
    let id = ''
    act(() => {
      id = result.current.success('可關閉')
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => {
      result.current.dismiss(id)
    })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('duration 過後自動消失', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.success('自動消失', 1000)
    })
    expect(result.current.toasts).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.toasts).toHaveLength(0)
  })

  it('duration<=0 時不自動消失（需手動 dismiss）', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useToast())
    act(() => {
      result.current.info('常駐通知', 0)
    })
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current.toasts).toHaveLength(1)
  })

  it('多個元件實例共享同一份全域佇列', () => {
    const first = renderHook(() => useToast())
    const second = renderHook(() => useToast())
    act(() => {
      first.result.current.success('共享狀態')
    })
    expect(second.result.current.toasts).toHaveLength(1)
    expect(second.result.current.toasts[0]?.message).toBe('共享狀態')
  })
})
