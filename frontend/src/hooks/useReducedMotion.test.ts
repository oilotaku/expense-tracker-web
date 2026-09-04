import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from './useReducedMotion'

interface MockMediaQueryList {
  matches: boolean
  media: string
  addEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void
  removeEventListener: (type: 'change', listener: (event: MediaQueryListEvent) => void) => void
  dispatch: (matches: boolean) => void
}

function createMockMediaQueryList(initialMatches: boolean): MockMediaQueryList {
  let listener: ((event: MediaQueryListEvent) => void) | null = null
  return {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type, changeListener) => {
      listener = changeListener
    },
    removeEventListener: (_type, changeListener) => {
      if (listener === changeListener) listener = null
    },
    dispatch(matches: boolean) {
      this.matches = matches
      listener?.({ matches } as unknown as MediaQueryListEvent)
    },
  }
}

describe('useReducedMotion', () => {
  let mediaQueryList: MockMediaQueryList

  beforeEach(() => {
    mediaQueryList = createMockMediaQueryList(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => mediaQueryList),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('系統無 reduced-motion 偏好時回傳 false', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('系統已開啟 prefers-reduced-motion 時回傳 true', () => {
    mediaQueryList = createMockMediaQueryList(true)
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => mediaQueryList),
    )
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })

  it('系統偏好透過 change 事件變更時同步更新', () => {
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    act(() => {
      mediaQueryList.dispatch(true)
    })
    expect(result.current).toBe(true)
  })
})
